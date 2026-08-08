import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

export type SponsorPackagesUpdatedPayload = {
  activity_id: number;
  sponsor_package_id: number;
  amount: number | null;
  is_active: boolean | null;
  at: string;
};

@WebSocketGateway({
  namespace: 'sponsor-packages',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class SponsorPackageGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('join_activity')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { activity_id?: number },
  ): void {
    const activityId = Number(payload?.activity_id);
    if (!Number.isFinite(activityId) || activityId < 1) return;
    void client.join(this.getActivityRoom(activityId));
  }

  @SubscribeMessage('leave_activity')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { activity_id?: number },
  ): void {
    const activityId = Number(payload?.activity_id);
    if (!Number.isFinite(activityId) || activityId < 1) return;
    void client.leave(this.getActivityRoom(activityId));
  }

  notifyActivitySponsorPackagesUpdated(
    activityId: number,
    sponsorPackageId: number,
    amount: number | null,
    isActive: boolean | null,
  ): void {
    if (!this.server || !activityId) return;
    const payload: SponsorPackagesUpdatedPayload = {
      activity_id: activityId,
      sponsor_package_id: sponsorPackageId,
      amount,
      is_active: isActive,
      at: new Date().toISOString(),
    };
    this.server
      .to(this.getActivityRoom(activityId))
      .emit('sponsor_packages_updated', payload);
  }

  private getActivityRoom(activityId: number): string {
    return `activity-sponsor-packages:${activityId}`;
  }
}
