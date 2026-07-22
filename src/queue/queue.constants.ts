/**
 * ชื่อคิว BullMQ ทั้งระบบ — เพิ่มตรงนี้เมื่อมีคิวใหม่
 * Redis keys: `{REDIS_PREFIX}:{name}:...`
 */
export const QUEUE_NAMES = {
  /** ส่งอีเมลแจ้งเตือนจาก admin mail-contents */
  MAIL_CONTENT_SEND: 'mail-content-send',
  /** สำรองไว้สำหรับคิว checkout แบบโรงพยาบาลในอนาคต */
  // CHECKOUT_DESK: 'checkout-desk',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
