export function groupDiveParticipants<T extends { id: string; diveDays: string[] }>(travelers: T[], year: string) {
  const groups = new Map<string, T[]>();
  for (const traveler of travelers) {
    const dates = traveler.diveDays.map((day) => {
      const short = day.match(/^(\d{1,2})\/(\d{1,2})$/);
      return short ? `${year}-${short[1].padStart(2, "0")}-${short[2].padStart(2, "0")}` : day;
    });
    for (const date of new Set(dates)) {
      const members = groups.get(date) || [];
      members.push(traveler);
      groups.set(date, members);
    }
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([date, travelers]) => ({ date, travelers }));
}
