import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UseGuards,
  Request,
  Res,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request as ExpressRequest, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AcceptPoliciesDto } from './dto/accept-policies.dto';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { User } from '../entities/user.entity';
import { ConfigService } from '@nestjs/config';
import { LoginLogService } from '../login-log/login-log.service';
import type { LoginProvider, LoginStatus } from '../entities/login-log.entity';

@Controller('auth')
@UseInterceptors(ResponseInterceptor)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly loginLogService: LoginLogService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.authService.verifyEmail(verifyEmailDto);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerificationEmail(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Request() req: { ip?: string; headers?: Record<string, unknown> },
  ) {
    const ipHeader =
      (req.headers?.['x-forwarded-for'] as string | undefined) || '';
    const clientIp = ipHeader.split(',')[0]?.trim() || req.ip || null;
    const userAgent =
      (req.headers?.['user-agent'] as string | undefined) || null;

    return this.authService.login(loginDto, {
      ip: clientIp,
      userAgent,
    });
  }

  /** เริ่มต้น LINE Login: redirect ไปหน้า LINE */
  @Get('line')
  async lineOAuthStart(@Res() res: Response) {
    const channelId = this.configService.get<string>('LINE_CHANNEL_ID');
    const callbackUrl = this.configService.get<string>('LINE_CALLBACK_URL');

    if (!channelId || !callbackUrl) {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? '';
      const redirectUrl = `${frontendUrl}/auth/callback?error=line_config_missing`;
      return res.redirect(302, redirectUrl);
    }

    const state = `line_${Math.random().toString(36).slice(2)}`;
    const scope = encodeURIComponent('profile openid email');

    const url =
      'https://access.line.me/oauth2/v2.1/authorize' +
      `?response_type=code&client_id=${encodeURIComponent(channelId)}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=${scope}`;

    return res.redirect(302, url);
  }

  /** เริ่มต้น OAuth: redirect ไปหน้า login Google (ทำทุกอย่างฝั่ง API) */
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleOAuthStart() {
    // Guard จะ redirect ไป Google ให้
  }

  /** Callback หลัง Google redirect กลับมา: สร้าง session แล้ว redirect ไป frontend พร้อม token */
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleOAuthCallback(
    @Request()
    req: { user: User; ip?: string; headers?: Record<string, unknown> },
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? '';
    const tokens = await this.authService.generateTokens(req.user);

    // log login success for Google OAuth redirect flow
    try {
      const ipHeader =
        (req.headers?.['x-forwarded-for'] as string | undefined) || '';
      const clientIp = ipHeader.split(',')[0]?.trim() || req.ip || null;
      const userAgent =
        (req.headers?.['user-agent'] as string | undefined) || null;

      await this.loginLogService.create({
        provider: 'google' as LoginProvider,
        status: 'success' as LoginStatus,
        user_id: req.user.id ?? null,
        email: req.user.email ?? null,
        ip: clientIp,
        user_agent: userAgent,
      });
    } catch {
      // don't break redirect if logging fails
    }

    const params = new URLSearchParams({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
    const redirectUrl = `${frontendUrl}/auth/callback?${params.toString()}`;
    res.redirect(302, redirectUrl);
  }

  /** Login ด้วย idToken (จาก frontend ที่ใช้ Google Identity Services) */
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleLogin(
    @Body() googleLoginDto: GoogleLoginDto,
    @Request() req: { ip?: string; headers?: Record<string, unknown> },
  ) {
    const ipHeader =
      (req.headers?.['x-forwarded-for'] as string | undefined) || '';
    const clientIp = ipHeader.split(',')[0]?.trim() || req.ip || null;
    const userAgent =
      (req.headers?.['user-agent'] as string | undefined) || null;

    return this.authService.googleLogin(googleLoginDto.idToken, {
      ip: clientIp,
      userAgent,
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req: { user: User }) {
    return this.authService.getProfile(req.user);
  }

  @Post('accept-policies')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async acceptPolicies(
    @Body() dto: AcceptPoliciesDto,
    @Request() req: ExpressRequest & { user: User },
  ) {
    const ipHeader =
      (req.headers?.['x-forwarded-for'] as string | undefined) || '';
    const clientIp = ipHeader.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
    const userAgent =
      (req.headers?.['user-agent'] as string | undefined) || null;
    return this.authService.acceptPolicies(req.user, dto, {
      ip: typeof clientIp === 'string' ? clientIp : null,
      userAgent,
    });
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateMe(
    @Request() req: { user: User },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(req.user, dto);
  }

  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new Error('กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น'), false);
        }
      },
    }),
  )
  @HttpCode(HttpStatus.OK)
  async uploadAvatar(
    @Request() req: { user: User },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      return {
        success: false,
        message: 'กรุณาเลือกรูปภาพ',
      };
    }
    try {
      const result = await this.authService.uploadAvatar(req.user, file);
      return {
        success: true,
        message: 'อัปโหลดรูปโปรไฟล์สำเร็จ',
        data: result,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'อัปโหลดรูปไม่สำเร็จ',
      };
    }
  }

  /** LINE Login callback: รับ code แล้ว redirect กลับ frontend พร้อม token */
  @Get('line/callback')
  async lineOAuthCallback(
    @Query('code') code: string | undefined,
    @Query('state') _state: string | undefined,
    @Res() res: Response,
    @Request() req: { ip?: string; headers?: Record<string, unknown> },
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? '';

    if (!code) {
      const redirectUrl = `${frontendUrl}/auth/callback?error=line_no_code`;
      return res.redirect(302, redirectUrl);
    }

    try {
      const ipHeader =
        (req.headers?.['x-forwarded-for'] as string | undefined) || '';
      const clientIp = ipHeader.split(',')[0]?.trim() || req.ip || null;
      const userAgent =
        (req.headers?.['user-agent'] as string | undefined) || null;

      const result = await this.authService.lineLoginWithCode(code, {
        ip: clientIp,
        userAgent,
      });
      const params = new URLSearchParams({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });
      const redirectUrl = `${frontendUrl}/auth/callback?${params.toString()}`;
      return res.redirect(302, redirectUrl);
    } catch (error: any) {
      const message =
        error?.message && typeof error.message === 'string'
          ? error.message
          : 'line_login_failed';
      const params = new URLSearchParams({
        error: message,
      });
      const redirectUrl = `${frontendUrl}/auth/callback?${params.toString()}`;
      return res.redirect(302, redirectUrl);
    }
  }
}
