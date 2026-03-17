import { SetMetadata } from '@nestjs/common';
import type {
  AuditAction,
  AuditEntityType,
} from '../../entities/audit-log.entity';

export const AUDIT_META_KEY = 'audit_meta';

export interface AuditMetadata {
  action: AuditAction;
  entity_type: AuditEntityType;
  /**
   * กำหนด pattern การดึง entity_id:
   * - 'param:id'        → ctx.switchToHttp().getRequest().params.id
   * - 'body:orderId'    → req.body.orderId
   * - 'result:order.id' → (ผลลัพธ์จาก handler).order.id
   */
  entityIdSource?: string;
}

export const Audit = (meta: AuditMetadata) => SetMetadata(AUDIT_META_KEY, meta);
