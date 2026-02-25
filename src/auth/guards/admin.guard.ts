import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { User, UserRole } from '../../entities/user.entity';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: User }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('ต้องเข้าสู่ระบบก่อน');
    }

    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ');
    }

    return true;
  }
}

