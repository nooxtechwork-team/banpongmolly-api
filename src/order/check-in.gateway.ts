import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: 'check-in',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class CheckInGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket): void {
    const token = this.extractAccessToken(client);
    if (!token) return;
    try {
      const payload = this.jwtService.verify<{ sub: number }>(token);
      const userId = payload?.sub;
      if (typeof userId === 'number' && userId > 0) {
        void client.join(this.getUserRoom(userId));
      }
    } catch {
      // token ไม่ถูกต้อง — ยังใช้ join_ticket สำหรับ QR ได้ตามเดิม
    }
  }

  private extractAccessToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }
    const authz = client.handshake.headers?.authorization;
    if (typeof authz === 'string' && authz.startsWith('Bearer ')) {
      const t = authz.slice(7).trim();
      if (t) return t;
    }
    const cookieHeader = client.handshake.headers?.cookie;
    if (typeof cookieHeader !== 'string' || !cookieHeader) return null;
    const match = cookieHeader
      .split(';')
      .map((s: string) => s.trim())
      .find((s: string) => s.startsWith('access_token='));
    if (!match) return null;
    const value = match.split('=').slice(1).join('=');
    return value ? decodeURIComponent(value) : null;
  }

  @SubscribeMessage('join_ticket')
  handleJoinTicket(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      registration_no?: string;
    },
  ): void {
    const registrationNo = payload?.registration_no?.trim();
    if (!registrationNo) return;
    const room = this.getTicketRoom(registrationNo);
    client.join(room);
  }

  @SubscribeMessage('leave_ticket')
  handleLeaveTicket(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      registration_no?: string;
    },
  ): void {
    const registrationNo = payload?.registration_no?.trim();
    if (!registrationNo) return;
    const room = this.getTicketRoom(registrationNo);
    client.leave(room);
  }

  private getTicketRoom(registrationNo: string): string {
    return `ticket:${registrationNo}`;
  }

  notifyTicketCheckedIn(registrationNo: string): void {
    const room = this.getTicketRoom(registrationNo);
    this.server.to(room).emit('ticket_checked_in', {
      registration_no: registrationNo,
      status: 'checked_in',
    });
  }

  /** แจ้งผู้ใช้ให้ดึงจำนวนตั๋วรอเช็คอินใหม่ (หลังอนุมัติชำระเงิน ฯลฯ) */
  notifyUserPendingTicketBadgeRefresh(userId: number): void {
    if (!userId) return;
    this.server
      .to(this.getUserRoom(userId))
      .emit('pending_ticket_badge_refresh', {
        reason: 'order_paid',
      });
  }

  private getUserRoom(userId: number): string {
    return `user:${userId}`;
  }
}
