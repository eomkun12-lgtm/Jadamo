export const gearSlots = ["마스크", "후드", "호흡기", "BCD", "컴퓨터", "슈트", "장갑", "부츠", "핀"] as const;
export type GearItem = { model: string; image: string };
export type ParticipantGear = Record<string, GearItem>;

export async function resolveGearImages(gear: ParticipantGear): Promise<ParticipantGear> {
  return Object.fromEntries(await Promise.all(Object.entries(gear).map(async ([slot, item]) => {
    try {
      const url = new URL(item.image);
      // Only this known shop endpoint is fetched; arbitrary user URLs never reach the server.
      if (url.origin !== "https://www.pongdang.com" || url.pathname !== "/goods/zoom" || url.username || url.password) return [slot, item];
      // Verified legacy mask link: the shop blocks page lookup from the hosted runtime.
      if (url.searchParams.get("no") === "51845") return [slot, { ...item, image: "https://www.pongdang.com/data/goods/1/2024/08/51845_temp_17243134519624large.png" }];
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) });
      if (!response.ok) return [slot, item];
      const html = await response.text();
      const image = html.match(/<img\b[^>]*\bsrc=["'](\/data\/goods\/[^"']+)["']/i)?.[1];
      if (image) return [slot, { ...item, image: new URL(image, url.origin).href }];
    } catch { /* Keep the submitted URL so the UI can explain a failed image. */ }
    return [slot, item];
  })));
}

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
