import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';

// ดึง JWT จาก cookie ด้วย เผื่อกรณีที่ client ส่งคำขอแบบไม่ใส่ Authorization header
// (เช่น เปิด URL ตรงใน browser)
const cookieExtractor = (req: any): string | null => {
  const cookieHeader = req?.headers?.cookie;
  if (typeof cookieHeader !== 'string' || !cookieHeader) return null;

  const match = cookieHeader
    .split(';')
    .map((s: string) => s.trim())
    .find((s: string) => s.startsWith('access_token='));

  if (!match) return null;

  const value = match.split('=').slice(1).join('=');
  return value ? decodeURIComponent(value) : null;
};

export type JwtPayload = {
  sub: number;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: ['auths', 'province'],
    });
    if (!user || user.deleted_at) {
      throw new UnauthorizedException('ไม่พบผู้ใช้');
    }
    return user;
  }
}
