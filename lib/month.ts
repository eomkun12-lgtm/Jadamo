const MONTH_LABELS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

export function normalizeMonth(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;

  const raw = String(value).trim().toUpperCase();
  const numericMatch = raw.match(/^(0?[1-9]|1[0-2])(?:월)?$/);
  if (numericMatch) return MONTH_LABELS[Number(numericMatch[1]) - 1];

  const englishIndex = MONTH_LABELS.indexOf(raw.slice(0, 3) as (typeof MONTH_LABELS)[number]);
  return englishIndex >= 0 ? MONTH_LABELS[englishIndex] : null;
}

export function monthNumber(value: unknown): number | null {
  const normalized = normalizeMonth(value);
  if (!normalized) return null;
  return MONTH_LABELS.indexOf(normalized as (typeof MONTH_LABELS)[number]) + 1;
}
