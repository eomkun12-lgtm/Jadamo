type CalendarDestination = { id: string; name: string; year: string; month: string };
type CalendarItem = { id: string; date: string; time: string; title: string; location: string; note: string };

function text(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(";", "\\;").replaceAll(",", "\\,");
}

function compactDate(value: string) {
  return value.replaceAll("-", "");
}

function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return compactDate(date.toISOString().slice(0, 10));
}

export function buildCalendarFeed(destination: CalendarDestination, items: CalendarItem[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JADAMO OCEAN Trip//Calendar//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(`JADAMO · ${destination.year} ${destination.month} ${destination.name}`)}`,
  ];

  for (const item of items.filter((value) => value.date)) {
    const date = compactDate(item.date);
    lines.push("BEGIN:VEVENT", `UID:${item.id}@jadamo-ocean-trip`, "DTSTAMP:20260829T000000Z");
    if (item.time) {
      const start = `${date}T${item.time.replace(":", "")}00`;
      const [hour, minute] = item.time.split(":").map(Number);
      const endMinutes = hour * 60 + minute + 60;
      const endTime = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}${String(endMinutes % 60).padStart(2, "0")}`;
      lines.push(`DTSTART;TZID=Asia/Seoul:${start}`, `DTEND;TZID=Asia/Seoul:${endMinutes >= 1440 ? nextDate(item.date) : date}T${endTime}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${nextDate(item.date)}`);
    }
    lines.push(`SUMMARY:${text(item.title)}`);
    if (item.location) lines.push(`LOCATION:${text(item.location)}`);
    if (item.note) lines.push(`DESCRIPTION:${text(item.note)}`);
    lines.push("END:VEVENT");
  }
  return `${lines.concat("END:VCALENDAR").join("\r\n")}\r\n`;
}
