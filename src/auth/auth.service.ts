import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { User, UserRole } from '../entities/user.entity';
import { UserAuth, AuthProvider } from '../entities/user-auth.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResponseUtil } from '../common/utils/response.util';
import { OAuth2Client } from 'google-auth-library';
import { MailService } from '../mail/mail.service';
import { LoginLogService } from '../login-log/login-log.service';
import type { LoginProvider, LoginStatus } from '../entities/login-log.entity';
import * as fs from 'fs';
import * as path from 'path';
import { LegalPolicyService } from '../legal/legal-policy.service';
import { AcceptPoliciesDto } from './dto/accept-policies.dto';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserAuth)
    private userAuthRepository: Repository<UserAuth>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
    private loginLogService: LoginLogService,
    private legalPolicyService: LegalPolicyService,
  ) {
    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (googleClientId) {
      this.googleClient = new OAuth2Client(googleClientId);
    }
  }

  async register(registerDto: RegisterDto) {
    const {
      email,
      password,
      fullname,
      phone_number,
      accepted_terms,
      terms_policy_version,
      privacy_policy_version,
    } = registerDto;

    if (!accepted_terms) {
      throw new BadRequestException('กรุณายอมรับข้อกำหนดและเงื่อนไข');
    }

    await this.legalPolicyService.assertVersionsMatchActive(
      terms_policy_version,
      privacy_policy_version,
    );

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new BadRequestException('อีเมลนี้ถูกสมัครไว้แล้ว');
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Generate verification token
    const verificationToken = this.generateVerificationToken();
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setHours(tokenExpiresAt.getHours() + 24); // 24 hours

    const now = new Date();

    // Create user
    const user = this.userRepository.create({
      email,
      fullname,
      phone_number: phone_number || null,
      is_verified: false,
      accepted_terms_at: now,
      terms_policy_version,
      privacy_policy_version,
    });

    const savedUser = await this.userRepository.save(user);

    await this.legalPolicyService.recordAcceptances({
      userId: savedUser.id,
      termsVersion: terms_policy_version,
      privacyVersion: privacy_policy_version,
      source: 'signup',
      ip: null,
      userAgent: null,
      relatedRegistrationId: null,
    });

    // Create auth record
    const userAuth = this.userAuthRepository.create({
      user_id: savedUser.id,
      provider: AuthProvider.LOCAL,
      provider_id: email,
      password_hash: passwordHash,
      verification_token: verificationToken,
      token_expires_at: tokenExpiresAt,
    });

    await this.userAuthRepository.save(userAuth);

    // TODO: Send verification email with token
    // For now, return token in response (remove in production)
    return ResponseUtil.success(
      {
        user: {
          id: savedUser.id,
          email: savedUser.email,
          fullname: savedUser.fullname,
          is_verified: savedUser.is_verified,
        },
        verification_token: verificationToken, // Remove in production
      },
      'สมัครสมาชิกสำเร็จ กรุณายืนยันอีเมลของคุณ',
    );
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const { token } = verifyEmailDto;

    const userAuth = await this.userAuthRepository.findOne({
      where: { verification_token: token },
      relations: ['user'],
    });

    if (!userAuth) {
      throw new NotFoundException('ลิงก์ยืนยันตัวตนไม่ถูกต้อง');
    }

    if (userAuth.token_expires_at && userAuth.token_expires_at < new Date()) {
      throw new BadRequestException('ลิงก์ยืนยันตัวตนหมดอายุแล้ว');
    }

    if (userAuth.user.is_verified) {
      throw new BadRequestException('อีเมลนี้ยืนยันแล้ว');
    }

    // Update user verification status
    userAuth.user.is_verified = true;
    await this.userRepository.save(userAuth.user);

    // Clear verification token
    userAuth.verification_token = null;
    userAuth.token_expires_at = null;
    await this.userAuthRepository.save(userAuth);

    return ResponseUtil.success(
      {
        user: {
          id: userAuth.user.id,
          email: userAuth.user.email,
          fullname: userAuth.user.fullname,
          is_verified: userAuth.user.is_verified,
        },
      },
      'ยืนยันอีเมลเรียบร้อยแล้ว',
    );
  }

  async login(
    loginDto: LoginDto,
    context?: { ip?: string | null; userAgent?: string | null },
  ) {
    const { email, password, remember_me = false } = loginDto;

    const user = await this.userRepository.findOne({
      where: { email },
      relations: ['auths'],
    });

    if (!user) {
      await this.logLogin({
        provider: 'local',
        status: 'failed',
        email,
        reason: 'USER_NOT_FOUND',
        ip: context?.ip ?? null,
        userAgent: context?.userAgent ?? null,
      });
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    // Find local auth
    const localAuth = user.auths.find(
      (auth) => auth.provider === AuthProvider.LOCAL && !auth.deleted_at,
    );

    if (!localAuth || !localAuth.password_hash) {
      await this.logLogin({
        provider: 'local',
        status: 'failed',
        userId: user.id,
        email: user.email,
        reason: 'NO_LOCAL_AUTH',
        ip: context?.ip ?? null,
        userAgent: context?.userAgent ?? null,
      });
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      password,
      localAuth.password_hash,
    );

    if (!isPasswordValid) {
      await this.logLogin({
        provider: 'local',
        status: 'failed',
        userId: user.id,
        email: user.email,
        reason: 'INVALID_PASSWORD',
        ip: context?.ip ?? null,
        userAgent: context?.userAgent ?? null,
      });
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    if (!user.is_verified) {
      const verificationToken = this.generateVerificationToken();
      const tokenExpiresAt = new Date();
      tokenExpiresAt.setHours(tokenExpiresAt.getHours() + 24);
      localAuth.verification_token = verificationToken;
      localAuth.token_expires_at = tokenExpiresAt;
      await this.userAuthRepository.save(localAuth);

      await this.mailService.sendVerificationEmail(
        user.email,
        verificationToken,
      );
      await this.logLogin({
        provider: 'local',
        status: 'failed',
        userId: user.id,
        email: user.email,
        reason: 'EMAIL_NOT_VERIFIED',
        ip: context?.ip ?? null,
        userAgent: context?.userAgent ?? null,
      });
      throw new UnauthorizedException(
        'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ เราได้ส่งลิงก์ยืนยันไปยังอีเมลของคุณอีกครั้งแล้ว',
      );
    }

    const tokens = await this.generateTokens(user, remember_me);

    await this.logLogin({
      provider: 'local',
      status: 'success',
      userId: user.id,
      email: user.email,
      ip: context?.ip ?? null,
      userAgent: context?.userAgent ?? null,
    });

    return ResponseUtil.success(
      {
        user: this.buildAuthUserPublic(user),
        ...tokens,
      },
      'เข้าสู่ระบบสำเร็จ',
    );
  }

  /**
   * ส่งอีเมลยืนยันอีกครั้ง (สำหรับผู้ที่ยังไม่ยืนยัน)
   * คืนข้อความเดียวกันไม่ว่า email จะมีในระบบหรือไม่ เพื่อไม่เปิดเผยข้อมูล
   */
  async resendVerificationEmail(dto: ResendVerificationDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email.trim().toLowerCase() },
      relations: ['auths'],
    });

    if (!user || user.is_verified) {
      return ResponseUtil.success(
        null,
        'ถ้ามีอีเมลนี้ในระบบและยังไม่ยืนยัน เราได้ส่งลิงก์ยืนยันไปยังอีเมลของคุณแล้ว กรุณาตรวจสอบกล่องจดหมาย',
      );
    }

    const localAuth = user.auths.find(
      (auth) => auth.provider === AuthProvider.LOCAL && !auth.deleted_at,
    );

    if (!localAuth) {
      return ResponseUtil.success(
        null,
        'ถ้ามีอีเมลนี้ในระบบและยังไม่ยืนยัน เราได้ส่งลิงก์ยืนยันไปยังอีเมลของคุณแล้ว กรุณาตรวจสอบกล่องจดหมาย',
      );
    }

    const verificationToken = this.generateVerificationToken();
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setHours(tokenExpiresAt.getHours() + 24);
    localAuth.verification_token = verificationToken;
    localAuth.token_expires_at = tokenExpiresAt;
    await this.userAuthRepository.save(localAuth);

    await this.mailService.sendVerificationEmail(user.email, verificationToken);

    return ResponseUtil.success(
      null,
      'เราได้ส่งลิงก์ยืนยันอีเมลไปยังกล่องจดหมายของคุณแล้ว กรุณาตรวจสอบอีเมลและคลิกลิงก์เพื่อยืนยัน',
    );
  }

  /**
   * LINE Login: แลก code → token → id_token แล้วผูก/ล็อกอิน user
   */
  async lineLoginWithCode(
    code: string,
    context?: { ip?: string | null; userAgent?: string | null },
  ) {
    const channelId = this.configService.get<string>('LINE_CHANNEL_ID');
    const channelSecret = this.configService.get<string>('LINE_CHANNEL_SECRET');
    const callbackUrl = this.configService.get<string>('LINE_CALLBACK_URL');

    if (!channelId || !channelSecret || !callbackUrl) {
      throw new BadRequestException('ยังไม่ได้ตั้งค่า LINE Login');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
      client_id: channelId,
      client_secret: channelSecret,
    });

    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!tokenRes.ok) {
      await this.logLogin({
        provider: 'line',
        status: 'failed',
        reason: 'LINE_TOKEN_EXCHANGE_FAILED',
        ip: context?.ip ?? null,
        userAgent: context?.userAgent ?? null,
      });
      throw new UnauthorizedException('ไม่สามารถเข้าสู่ระบบด้วย LINE ได้');
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      id_token?: string;
    };

    const idToken = tokenData.id_token;
    if (!idToken) {
      await this.logLogin({
        provider: 'line',
        status: 'failed',
        reason: 'LINE_NO_ID_TOKEN',
        ip: context?.ip ?? null,
        userAgent: context?.userAgent ?? null,
      });
      throw new UnauthorizedException('ไม่พบ id_token จาก LINE');
    }

    const payload = this.jwtService.decode(idToken) as {
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
    } | null;

    if (!payload || !payload.sub) {
      await this.logLogin({
        provider: 'line',
        status: 'failed',
        reason: 'LINE_PAYLOAD_INVALID',
        ip: context?.ip ?? null,
        userAgent: context?.userAgent ?? null,
      });
      throw new UnauthorizedException('โทเคน LINE ไม่ถูกต้อง');
    }

    const user = await this.lineLoginFromPayload({
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    });
    const tokens = await this.generateTokens(user);

    await this.logLogin({
      provider: 'line',
      status: 'success',
      userId: user.id,
      email: user.email,
      ip: context?.ip ?? null,
      userAgent: context?.userAgent ?? null,
    });

    return {
      user,
      ...tokens,
    };
  }

  /**
   * ผูก/สร้าง user จาก payload ของ LINE id_token (ใช้ similar flow กับ Google)
   */
  private async lineLoginFromPayload(payload: {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
  }): Promise<User> {
    const lineId = payload.sub;
    const email = payload.email;
    const fullname = payload.name || 'LINE User';
    const avatarUrl = payload.picture ?? null;

    if (!email) {
      throw new BadRequestException('LINE ไม่ได้ให้ข้อมูลอีเมล');
    }

    // เคยผูก LINE แล้ว → คืน user เดิม (แต่ถ้า accepted_terms_at ยังว่าง ให้ stamp ให้ด้วย)
    const existingAuth = await this.userAuthRepository.findOne({
      where: {
        provider: AuthProvider.LINE,
        provider_id: lineId,
      },
      relations: ['user'],
    });

    if (existingAuth?.user && !existingAuth.user.deleted_at) {
      return existingAuth.user;
    }

    // ยังไม่เคยผูก LINE: หา user จากอีเมลก่อน
    let user = await this.userRepository.findOne({
      where: { email },
      relations: ['auths'],
    });

    if (!user) {
      user = this.userRepository.create({
        email,
        fullname,
        avatar_url: avatarUrl,
        is_verified: true,
        accepted_terms_at: null,
        terms_policy_version: '0',
        privacy_policy_version: '0',
      });
      user = await this.userRepository.save(user);
    }

    const userAuth = this.userAuthRepository.create({
      user_id: user.id,
      provider: AuthProvider.LINE,
      provider_id: lineId,
    });
    await this.userAuthRepository.save(userAuth);

    return user;
  }

  /**
   * Login ด้วย idToken จาก Google (ฝั่ง frontend ส่งมา)
   * ใช้ logic เดียวกับ googleLoginFromProfile: เช็ค provider_id ก่อน (login) ไม่เจอค่อย insert (สมัคร)
   */
  async googleLogin(
    idToken: string,
    context?: { ip?: string | null; userAgent?: string | null },
  ) {
    if (!this.googleClient) {
      throw new BadRequestException('ยังไม่ได้ตั้งค่า Google OAuth');
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      if (!payload) {
        await this.logLogin({
          provider: 'google',
          status: 'failed',
          reason: 'GOOGLE_PAYLOAD_EMPTY',
          ip: context?.ip ?? null,
          userAgent: context?.userAgent ?? null,
        });
        throw new UnauthorizedException('โทเคน Google ไม่ถูกต้อง');
      }

      const profile = {
        id: payload.sub,
        emails: payload.email ? [{ value: payload.email }] : undefined,
        displayName:
          [payload.given_name, payload.family_name].filter(Boolean).join(' ') ||
          undefined,
        name: {
          givenName: payload.given_name ?? undefined,
          familyName: payload.family_name ?? undefined,
        },
        photos: payload.picture ? [{ value: payload.picture }] : undefined,
      };

      const user = await this.googleLoginFromProfile(profile);
      const tokens = await this.generateTokens(user);

      await this.logLogin({
        provider: 'google',
        status: 'success',
        userId: user.id,
        email: user.email,
        ip: context?.ip ?? null,
        userAgent: context?.userAgent ?? null,
      });

      return ResponseUtil.success(
        {
          user: this.buildAuthUserPublic(user),
          ...tokens,
        },
        'เข้าสู่ระบบด้วย Google สำเร็จ',
      );
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      await this.logLogin({
        provider: 'google',
        status: 'failed',
        reason: 'GOOGLE_LOGIN_ERROR',
        metadata: {
          message:
            error instanceof Error
              ? error.message
              : 'Unknown Google login error',
        },
        ip: context?.ip ?? null,
        userAgent: context?.userAgent ?? null,
      });
      throw new UnauthorizedException('โทเคน Google ไม่ถูกต้อง');
    }
  }

  /**
   * สำหรับ OAuth redirect flow: รับ profile จาก Passport หลัง Google redirect กลับมา
   * - ครั้งแรก (ไม่มี provider_id นี้): insert user + user_auth (provider=google, provider_id) เหมือนสมัคร
   * - ครั้งถัดไป: เช็ค provider_id แล้ว login (คืน user ที่ผูกกับ auth นี้)
   */
  async googleLoginFromProfile(profile: {
    id: string;
    emails?: Array<{ value: string }>;
    displayName?: string;
    name?: { givenName?: string; familyName?: string };
    photos?: Array<{ value: string }>;
  }): Promise<User> {
    const googleId = profile.id;
    const email = profile.emails?.[0]?.value;
    const fullname =
      profile.displayName ??
      [profile.name?.givenName, profile.name?.familyName]
        .filter(Boolean)
        .join(' ') ??
      'User';
    const avatarUrl = profile.photos?.[0]?.value ?? null;

    if (!email) {
      throw new BadRequestException('Google ไม่ได้ให้ข้อมูลอีเมล');
    }

    // ครั้งถัดไป: เช็ค provider_id → เอาข้อมูล user จาก DB เท่านั้น (ไม่เอา profile จาก Google มาอัปเดต)
    const existingAuth = await this.userAuthRepository.findOne({
      where: {
        provider: AuthProvider.GOOGLE,
        provider_id: googleId,
      },
      relations: ['user'],
    });

    if (existingAuth?.user && !existingAuth.user.deleted_at) {
      return existingAuth.user;
    }

    // ครั้งแรก: ยังไม่มี provider_id นี้ → insert user ด้วย profile data จาก Google (เหมือนสมัคร)
    let user = await this.userRepository.findOne({
      where: { email },
      relations: ['auths'],
    });

    if (!user) {
      user = this.userRepository.create({
        email,
        fullname,
        avatar_url: avatarUrl,
        is_verified: true,
        accepted_terms_at: null,
        terms_policy_version: '0',
        privacy_policy_version: '0',
      });
      user = await this.userRepository.save(user);
    }

    // ผูก Google กับ user (insert user_auth)
    const userAuth = this.userAuthRepository.create({
      user_id: user.id,
      provider: AuthProvider.GOOGLE,
      provider_id: googleId,
    });
    await this.userAuthRepository.save(userAuth);

    return user;
  }

  async generateTokens(user: User, rememberMe: boolean = true) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessExpires =
      this.configService.get<string>('JWT_EXPIRATION') || '1h';
    const refreshExpires =
      this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d';

    const isAdmin = user.role === UserRole.ADMIN;
    /** ~100 ปี (วินาที) — jsonwebtoken ไม่ยอมรับ expiresIn เป็น undefined */
    const adminTokenTtlSeconds = 60 * 60 * 24 * 365 * 100;

    const accessToken = await this.jwtService.signAsync(
      payload,
      isAdmin
        ? {
            secret: this.configService.get<string>('JWT_SECRET'),
            expiresIn: adminTokenTtlSeconds,
          }
        : {
            secret: this.configService.get<string>('JWT_SECRET'),
            expiresIn: rememberMe ? accessExpires : '1h',
          },
    );

    const refreshToken = await this.jwtService.signAsync(
      payload,
      isAdmin
        ? {
            secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
            expiresIn: adminTokenTtlSeconds,
          }
        : {
            secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
            expiresIn: rememberMe ? refreshExpires : '24h',
          },
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  /** ข้อมูล user สำหรับล็อกอิน / ส่งให้ frontend (รวมสถานะต้องยอมรับนโยบายหรือไม่) */
  private buildAuthUserPublic(user: User) {
    return {
      id: user.id,
      email: user.email,
      fullname: user.fullname,
      avatar_url: user.avatar_url,
      role: user.role,
      is_verified: user.is_verified,
      requires_policy_acceptance: !user.accepted_terms_at,
    };
  }

  async acceptPolicies(
    user: User,
    dto: AcceptPoliciesDto,
    context?: { ip?: string | null; userAgent?: string | null },
  ) {
    if (!dto.accept_policies) {
      throw new BadRequestException('กรุณายืนยันการยอมรับนโยบาย');
    }
    await this.legalPolicyService.assertVersionsMatchActive(
      dto.terms_policy_version,
      dto.privacy_policy_version,
    );
    const now = new Date();
    user.accepted_terms_at = now;
    user.terms_policy_version = dto.terms_policy_version;
    user.privacy_policy_version = dto.privacy_policy_version;
    await this.userRepository.save(user);
    await this.legalPolicyService.recordAcceptances({
      userId: user.id,
      termsVersion: dto.terms_policy_version,
      privacyVersion: dto.privacy_policy_version,
      source: 'account_reaccept',
      ip: context?.ip ?? null,
      userAgent: context?.userAgent ?? null,
      relatedRegistrationId: null,
    });
    const reloaded = await this.userRepository.findOne({
      where: { id: user.id },
      relations: ['province'],
    });
    return this.getProfile(reloaded ?? user);
  }

  async getProfile(user: User) {
    return ResponseUtil.success(
      {
        user: {
          id: user.id,
          email: user.email,
          fullname: user.fullname,
          farm_name: user.farm_name,
          contact_address: user.contact_address,
          phone_number: user.phone_number,
          avatar_url: user.avatar_url,
          province_id: user.province_id,
          province_name: user.province?.name ?? null,
          about_you: user.about_you,
          line_id: user.line_id,
          role: user.role,
          is_verified: user.is_verified,
          created_at: user.created_at,
          accepted_terms_at: user.accepted_terms_at,
          requires_policy_acceptance: !user.accepted_terms_at,
          terms_policy_version: user.terms_policy_version,
          privacy_policy_version: user.privacy_policy_version,
        },
      },
      'สำเร็จ',
    );
  }

  async updateProfile(
    user: User,
    data: {
      fullname?: string;
      farm_name?: string;
      contact_address?: string;
      phone_number?: string;
      province_id?: number;
      about_you?: string;
      line_id?: string;
      avatar_url?: string;
    },
  ) {
    const patch: Partial<{
      fullname: string;
      farm_name: string | null;
      contact_address: string | null;
      phone_number: string | null;
      province_id: number | null;
      about_you: string | null;
      line_id: string | null;
      avatar_url: string | null;
    }> = {};

    if (data.fullname !== undefined) patch.fullname = data.fullname;
    if (data.farm_name !== undefined) patch.farm_name = data.farm_name || null;
    if (data.contact_address !== undefined)
      patch.contact_address = data.contact_address || null;
    if (data.phone_number !== undefined)
      patch.phone_number = data.phone_number || null;
    if (data.province_id !== undefined)
      patch.province_id = data.province_id ?? null;
    if (data.about_you !== undefined) patch.about_you = data.about_you || null;
    if (data.line_id !== undefined) patch.line_id = data.line_id || null;
    if (data.avatar_url !== undefined)
      patch.avatar_url = data.avatar_url || null;

    if (Object.keys(patch).length > 0) {
      await this.userRepository.update({ id: user.id }, patch);
    }

    const reloaded = await this.userRepository.findOne({
      where: { id: user.id },
      relations: ['province'],
    });
    return this.getProfile(reloaded ?? user);
  }

  async uploadAvatar(
    user: User,
    file: Express.Multer.File,
  ): Promise<{ avatar_url: string }> {
    if (!file) {
      throw new Error('ไม่พบไฟล์ที่อัปโหลด');
    }

    // Validate file type
    if (!file.mimetype.startsWith('image/')) {
      throw new Error('กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น');
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('ขนาดไฟล์ต้องไม่เกิน 5MB');
    }

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Delete old avatar file if exists
    if (
      user.avatar_url &&
      !user.avatar_url.startsWith('http://') &&
      !user.avatar_url.startsWith('https://')
    ) {
      try {
        const oldAvatarPath = path.join(
          process.cwd(),
          'public',
          user.avatar_url,
        );
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
        }
      } catch (error) {
        // Log error but don't fail the upload if old file deletion fails
        console.error('Failed to delete old avatar file:', error);
      }
    }

    const fileExt = path.extname(file.originalname);
    const fileName = `avatar-${user.id}-${Date.now()}${fileExt}`;
    const filePath = path.join(uploadsDir, fileName);

    // Write file buffer to disk
    fs.writeFileSync(filePath, file.buffer);

    // Return the URL path (adjust based on your server setup)
    const avatarUrl = `/uploads/avatars/${fileName}`;

    // Update user avatar_url
    user.avatar_url = avatarUrl;
    await this.userRepository.save(user);

    return { avatar_url: avatarUrl };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: number;
        email: string;
        role: string;
      }>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });
      if (!user || user.deleted_at) {
        throw new UnauthorizedException('โทเคนไม่ถูกต้อง');
      }
      const tokens = await this.generateTokens(user);
      return ResponseUtil.success(
        {
          user: {
            id: user.id,
            email: user.email,
            fullname: user.fullname,
            avatar_url: user.avatar_url,
            role: user.role,
            is_verified: user.is_verified,
          },
          ...tokens,
        },
        'สำเร็จ',
      );
    } catch {
      throw new UnauthorizedException('โทเคนหมดอายุหรือไม่ถูกต้อง');
    }
  }

  private generateVerificationToken(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15) +
      Date.now().toString(36)
    );
  }

  private async logLogin(input: {
    provider: LoginProvider;
    status: LoginStatus;
    userId?: number;
    email?: string;
    reason?: string;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.loginLogService.create({
        provider: input.provider,
        status: input.status,
        user_id: input.userId ?? null,
        email: input.email ?? null,
        reason: input.reason ?? null,
        ip: input.ip ?? null,
        user_agent: input.userAgent ?? null,
        metadata: input.metadata ?? null,
      });
    } catch {
      // don't break auth flow if logging fails
    }
  }
}
