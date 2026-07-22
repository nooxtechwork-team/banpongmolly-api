import { QUEUE_NAMES } from '../queue/queue.constants';

/** @deprecated ใช้ QUEUE_NAMES.MAIL_CONTENT_SEND */
export const MAIL_CONTENT_SEND_QUEUE = QUEUE_NAMES.MAIL_CONTENT_SEND;

export type MailContentSendJobData = {
  recipientId: number;
  mailContentId: number;
  sendRound: number;
};
