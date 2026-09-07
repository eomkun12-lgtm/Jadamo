export const transportLabels = {
  pending: "이동 미정 · 확인 중",
  confirmed: "항공 · 예약 완료",
  car: "차량 · 자가용 / 카풀",
  train: "기차",
  bus: "버스",
  ferry: "선박",
  separate: "개별 이동",
} as const;

export type TransportStatus = keyof typeof transportLabels;

export function transportGroupKey(traveler: { flightStatus: TransportStatus; flightNote: string }) {
  const note = traveler.flightNote.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
  return !note || traveler.flightStatus === "pending" || traveler.flightStatus === "separate" ? null : `${traveler.flightStatus}:${note}`;
}
