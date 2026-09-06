export const gearSlots = ["마스크", "후드", "호흡기", "BCD", "컴퓨터", "슈트", "장갑", "부츠", "핀"] as const;
export type GearItem = { model: string; image: string };
export type ParticipantGear = Record<string, GearItem>;

export function validateGear(value: unknown): ParticipantGear {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("장비 정보를 확인해 주세요.");
  const result: ParticipantGear = {};
  for (const [slot, item] of Object.entries(value)) {
    if (!gearSlots.includes(slot as typeof gearSlots[number]) || !item || typeof item !== "object") throw new Error("장비 항목을 확인해 주세요.");
    const { model, image } = item as GearItem;
    if (typeof model !== "string" || model.length > 100 || typeof image !== "string" || image.length > 2000) throw new Error("모델명과 사진 주소를 확인해 주세요.");
    if (image && new URL(image).protocol !== "https:") throw new Error("사진은 HTTPS 주소를 입력해 주세요.");
    if (model.trim()) result[slot] = { model: model.trim(), image: image.trim() };
  }
  return result;
}
