import {
  ConnectedSocket,
  MessageBody,
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
export class CheckInGateway {
  @WebSocketServer()
  server: Server;

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
}
