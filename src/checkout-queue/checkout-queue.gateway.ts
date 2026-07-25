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

export type CheckoutBoardPayload = {
  activity_id: number;
  counts: {
    waiting: number;
    preparing: number;
    ready: number;
    complete: number;
  };
  devices: Array<{
    code: string;
    name: string;
    status: string;
    queue_code: string | null;
  }>;
};

export type CheckoutTicketLivePayload = {
  ticket_id: number;
  queue_code: string;
  status: string;
  activity_id: number;
  user_id: number;
  position?: number | null;
};

@WebSocketGateway({
  namespace: 'checkout',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class CheckoutQueueGateway implements OnGatewayConnection {
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
      // token ไม่ถูกต้อง — ยัง join room ด้วย message ได้
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

  @SubscribeMessage('join_activity_checkout')
  handleJoinActivity(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { activity_id?: number },
  ): void {
    const activityId = Number(payload?.activity_id);
    if (!Number.isFinite(activityId) || activityId < 1) return;
    void client.join(this.getActivityRoom(activityId));
  }

  @SubscribeMessage('leave_activity_checkout')
  handleLeaveActivity(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { activity_id?: number },
  ): void {
    const activityId = Number(payload?.activity_id);
    if (!Number.isFinite(activityId) || activityId < 1) return;
    void client.leave(this.getActivityRoom(activityId));
  }

  @SubscribeMessage('join_ticket')
  handleJoinTicket(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { queue_code?: string; ticket_id?: number },
  ): void {
    const queueCode = payload?.queue_code?.trim();
    if (queueCode) {
      void client.join(this.getTicketCodeRoom(queueCode));
    }
    const ticketId = Number(payload?.ticket_id);
    if (Number.isFinite(ticketId) && ticketId > 0) {
      void client.join(this.getTicketIdRoom(ticketId));
    }
  }

  @SubscribeMessage('leave_ticket')
  handleLeaveTicket(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { queue_code?: string; ticket_id?: number },
  ): void {
    const queueCode = payload?.queue_code?.trim();
    if (queueCode) {
      void client.leave(this.getTicketCodeRoom(queueCode));
    }
    const ticketId = Number(payload?.ticket_id);
    if (Number.isFinite(ticketId) && ticketId > 0) {
      void client.leave(this.getTicketIdRoom(ticketId));
    }
  }

  emitBoardUpdated(activityId: number, board: CheckoutBoardPayload): void {
    this.server
      .to(this.getActivityRoom(activityId))
      .emit('checkout_board_updated', board);
  }

  emitTicketUpdated(payload: CheckoutTicketLivePayload): void {
    this.server
      .to(this.getTicketIdRoom(payload.ticket_id))
      .emit('checkout_ticket_updated', payload);
    this.server
      .to(this.getTicketCodeRoom(payload.queue_code))
      .emit('checkout_ticket_updated', payload);
    this.server
      .to(this.getUserRoom(payload.user_id))
      .emit('checkout_ticket_updated', payload);
    this.server
      .to(this.getActivityRoom(payload.activity_id))
      .emit('checkout_ticket_updated', payload);
  }

  private getActivityRoom(activityId: number): string {
    return `activity:${activityId}:checkout`;
  }

  private getTicketIdRoom(ticketId: number): string {
    return `checkout_ticket:${ticketId}`;
  }

  private getTicketCodeRoom(queueCode: string): string {
    return `checkout_queue:${queueCode}`;
  }

  private getUserRoom(userId: number): string {
    return `user:${userId}`;
  }
}
