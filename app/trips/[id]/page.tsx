import { eq } from "drizzle-orm";
import OceanTripTemplate from "../ishigaki-2026/page";
import { getDb } from "../../../db";
import { destinations, tripItems } from "../../../db/schema";

const palauOctober2027Plan = [
  { id: "palau-20271001-icn-tpe", category: "flight", date: "2027-10-01", title: "인천 → 타이페이", location: "인천국제공항 → 타이페이", note: "팔라우 이동을 위한 대만 경유 일정. 항공편/시간은 추후 확정." },
  { id: "palau-20271001-taiwan-stay", category: "stay", date: "2027-10-01", title: "대만 1박", location: "타이페이", note: "10/2 팔라우행 연결을 위한 대만 1박. 숙소는 추후 확정." },
  { id: "palau-20271002-tpe-ror", category: "flight", date: "2027-10-02", title: "타이페이 → 팔라우", location: "타이페이 → 팔라우", note: "타이페이↔팔라우 노선이 월·수·목·토 운항을 유지한다고 가정한 일정. 항공편/시간은 추후 확정." },
  { id: "palau-20271003-dive-day1", category: "activity", date: "2027-10-03", title: "팔라우 다이빙 Day 1", location: "Palau", note: "총 4일 다이빙 중 1일차." },
  { id: "palau-20271004-dive-day2", category: "activity", date: "2027-10-04", title: "팔라우 다이빙 Day 2", location: "Palau", note: "총 4일 다이빙 중 2일차." },
  { id: "palau-20271005-dive-day3", category: "activity", date: "2027-10-05", title: "팔라우 다이빙 Day 3", location: "Palau", note: "총 4일 다이빙 중 3일차." },
  { id: "palau-20271006-dive-day4", category: "activity", date: "2027-10-06", title: "팔라우 다이빙 Day 4", location: "Palau", note: "총 4일 다이빙 중 4일차." },
  { id: "palau-20271007-ror-tpe", category: "flight", date: "2027-10-07", title: "팔라우 → 타이페이", location: "팔라우 → 타이페이", note: "타이페이↔팔라우 노선이 월·수·목·토 운항을 유지한다고 가정한 귀국 경유 일정. 항공편/시간은 추후 확정." },
  { id: "palau-20271007-taiwan-stay", category: "stay", date: "2027-10-07", title: "대만 1박", location: "타이페이", note: "10/8 인천 귀국 전 대만 1박. 숙소는 추후 확정." },
  { id: "palau-20271008-tpe-icn", category: "flight", date: "2027-10-08", title: "타이페이 → 인천", location: "타이페이 → 인천국제공항", note: "팔라우 투어 귀국 일정. 항공편/시간은 추후 확정." },
] as const;

async function ensurePalauOctober2027Plan(id: string) {
  const db = getDb();
  const [destination] = await db.select().from(destinations).where(eq(destinations.id, id)).limit(1);
  if (!destination) return;

  const normalizedName = destination.name.trim().toLocaleLowerCase("ko-KR");
  const isPalau = normalizedName === "palau" || normalizedName === "팔라우";
  const isOctober2027 = destination.year === "2027" && destination.month.trim().toUpperCase() === "OCT";
  if (!isPalau || !isOctober2027) return;

  const existing = await db.select({ id: tripItems.id, sortOrder: tripItems.sortOrder }).from(tripItems).where(eq(tripItems.destinationId, id));
  const existingIds = new Set(existing.map((item) => item.id));
  let sortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;

  for (const item of palauOctober2027Plan) {
    if (existingIds.has(item.id)) continue;
    await db.insert(tripItems).values({
      id: item.id,
      destinationId: id,
      category: item.category,
      date: item.date,
      time: "",
      title: item.title,
      location: item.location,
      note: item.note,
      sortOrder,
    });
    sortOrder += 1;
  }
}

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await ensurePalauOctober2027Plan(id);
  return <OceanTripTemplate tripId={id} />;
}
