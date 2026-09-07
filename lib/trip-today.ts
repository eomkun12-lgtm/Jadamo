export const bookingLabels = { unknown: "미확인", candidate: "후보", required: "예약 필요", confirmed: "확정", unnecessary: "예약 불필요" };
export type BookingStatus = keyof typeof bookingLabels;
export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === "string" && Object.hasOwn(bookingLabels, value);
}

export function tripToday<T extends { date: string; time: string }>(items: T[], now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const time = `${part("hour")}:${part("minute")}`;
  const dated = items.filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date)).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99:99").localeCompare(b.time || "99:99"));
  const start = dated[0]?.date;
  const end = dated.at(-1)?.date;
  const next = dated.find(item => item.date > today || (item.date === today && (!item.time || item.time >= time)));
  const days = start ? Math.round((Date.parse(start) - Date.parse(today)) / 86400000) : 0;
  return { today, next, days, state: !start ? "undated" : today < start ? "before" : today > end! ? "after" : "during" };
}
