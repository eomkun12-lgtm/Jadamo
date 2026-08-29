import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { destinations, tripItems } from "../../../../../../db/schema";
import { buildCalendarFeed } from "../../../../../../lib/ical";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const [destination] = await getDb().select().from(destinations).where(eq(destinations.id, id)).limit(1);
  if (!destination) return new Response("여행지를 찾지 못했습니다.", { status: 404 });
  const items = await getDb().select().from(tripItems).where(eq(tripItems.destinationId, id)).orderBy(asc(tripItems.sortOrder));
  return new Response(buildCalendarFeed(destination, items), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="jadamo-${id}.ics"`,
      "Cache-Control": "no-cache",
    },
  });
}
