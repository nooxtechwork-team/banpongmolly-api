import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

export type PackagePricesUpdatedPayload = {
  package_root_id: number;
  package_id: number;
  amount: number | null;
  at: string;
};

@WebSocketGateway({
  namespace: 'activity-packages',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class ActivityPackageGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('join_package_tree')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { package_root_id?: number },
  ): void {
    const rootId = Number(payload?.package_root_id);
    if (!Number.isFinite(rootId) || rootId < 1) return;
    void client.join(this.getTreeRoom(rootId));
  }

  @SubscribeMessage('leave_package_tree')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { package_root_id?: number },
  ): void {
    const rootId = Number(payload?.package_root_id);
    if (!Number.isFinite(rootId) || rootId < 1) return;
    void client.leave(this.getTreeRoom(rootId));
  }

  notifyPackageTreePricesUpdated(
    packageRootId: number,
    packageId: number,
    amount: number | null,
  ): void {
    if (!this.server || !packageRootId) return;
    const payload: PackagePricesUpdatedPayload = {
      package_root_id: packageRootId,
      package_id: packageId,
      amount,
      at: new Date().toISOString(),
    };
    this.server
      .to(this.getTreeRoom(packageRootId))
      .emit('package_prices_updated', payload);
  }

  private getTreeRoom(packageRootId: number): string {
    return `package-tree:${packageRootId}`;
  }
}
