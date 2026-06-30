import { Activity } from '../../entities/activity.entity';

export type OnsiteCashStatus = {
  available: boolean;
  within_event_dates: boolean;
};

function dayStart(value: Date): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayEnd(value: Date): Date {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getOnsiteCashStatus(
  activity: Activity,
  now: Date = new Date(),
): OnsiteCashStatus {
  if (!activity.allow_onsite_cash) {
    return { available: false, within_event_dates: false };
  }

  const eventStart = dayStart(new Date(activity.start_date));
  const eventEnd = dayEnd(new Date(activity.end_date));
  const within_event_dates = now >= eventStart && now <= eventEnd;

  const openAt = activity.onsite_cash_open_at
    ? new Date(activity.onsite_cash_open_at)
    : eventStart;
  const closeAt = activity.onsite_cash_close_at
    ? new Date(activity.onsite_cash_close_at)
    : eventEnd;

  const available = now >= openAt && now <= closeAt;

  return { available, within_event_dates };
}
