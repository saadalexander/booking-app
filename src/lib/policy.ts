/** Pure booking-policy helpers (unit-tested). */
/**
 * Hours before the start until which a client may reschedule/cancel online.
 * Never stricter than the booking type's own minimum notice: if a client may book with 4 hours'
 * notice, they can also change it until 4 hours before (otherwise a same-day booking could never
 * be changed online, not even right after making it).
 */
export function changeWindowHours(et: { cancelWindowHours: number | null; minNoticeMinutes: number }, defaultHours: number) {
  const policy = et.cancelWindowHours ?? defaultHours;
  return Math.max(0, Math.min(policy, Math.floor(et.minNoticeMinutes / 60)));
}
