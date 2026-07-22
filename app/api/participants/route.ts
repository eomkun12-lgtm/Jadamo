import { asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { destinations, travelers } from "../../../db/schema";
import { monthNumber } from "../../../lib/month";

type ParticipantTrip = { id: string; name: string; month: string; year: string };

export async function GET() {
  try {
    const db = getDb();
    const [travelerRows, destinationRows] = await Promise.all([
      db.select({ name: travelers.name, gender: travelers.gender, destinationId: travelers.destinationId, createdAt: travelers.createdAt }).from(travelers).orderBy(asc(travelers.createdAt)).limit(1000),
      db.select({ id: destinations.id, name: destinations.name, month: destinations.month, year: destinations.year }).from(destinations).limit(100),
    ]);
    const destinationMap = new Map(destinationRows.map((destination) => [destination.id, destination]));
    const grouped = new Map<string, { name: string; gender: string; trips: Map<string, ParticipantTrip> }>();

    travelerRows.forEach((traveler) => {
      const key = traveler.name.trim().toLocaleLowerCase("ko-KR");
      if (!key) return;
      const destination = destinationMap.get(traveler.destinationId);
      if (!destination) return;
      const participant = grouped.get(key) || { name: traveler.name.trim(), gender: traveler.gender, trips: new Map<string, ParticipantTrip>() };
      participant.trips.set(destination.id, destination);
      if (participant.gender === "unspecified" && traveler.gender !== "unspecified") participant.gender = traveler.gender;
      grouped.set(key, participant);
    });

    const participants = [...grouped.values()].map((participant) => {
      const trips = [...participant.trips.values()].sort((first, second) => {
        const firstValue = Number(first.year) * 100 + (monthNumber(first.month) || 99);
        const secondValue = Number(second.year) * 100 + (monthNumber(second.month) || 99);
        return firstValue - secondValue;
      });
      return { name: participant.name, gender: participant.gender, attendanceCount: trips.length, trips };
    }).sort((first, second) => second.attendanceCount - first.attendanceCount || first.name.localeCompare(second.name, "ko-KR"));

    return Response.json({ participants });
  } catch {
    return Response.json({ error: "참석자 현황을 불러오지 못했습니다." }, { status: 500 });
  }
}
