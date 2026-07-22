import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { destinations, notices } from "../../../db/schema";
import { isSiteAdmin } from "../../admin-auth";

type NoticePayload = {
  id?: string;
  destinationId?: string | null;
  title?: string;
  content?: string;
  startAt?: string;
  endAt?: string;
  isPopup?: boolean;
  isImportant?: boolean;
};

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isPublished(row: typeof notices.$inferSelect, now: string) {
  return (!row.startAt || row.startAt <= now) && (!row.endAt || row.endAt >= now);
}

async function values(payload: NoticePayload) {
  const destinationId = clean(payload.destinationId, 80) || null;
  const title = clean(payload.title, 80);
  const content = clean(payload.content, 1200);
  const startAt = clean(payload.startAt, 30);
  const endAt = clean(payload.endAt, 30);
  if (!title) throw new Error("공지 제목을 입력해 주세요.");
  if (!content) throw new Error("공지 내용을 입력해 주세요.");
  if (startAt && endAt && startAt > endAt) throw new Error("종료일은 시작일보다 뒤여야 합니다.");
  if (destinationId) {
    const [destination] = await getDb().select({ id: destinations.id }).from(destinations).where(eq(destinations.id, destinationId)).limit(1);
    if (!destination) throw new Error("선택한 여행지를 찾지 못했습니다.");
  }
  return { destinationId, title, content, startAt, endAt, isPopup: payload.isPopup === false ? 0 : 1, isImportant: payload.isImportant ? 1 : 0 };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "공지를 처리하지 못했습니다.";
  const status = message.includes("입력") || message.includes("뒤여야") || message.includes("찾지") ? 400 : 500;
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const destinationId = clean(new URL(request.url).searchParams.get("destinationId"), 80);
    const admin = await isSiteAdmin();
    const rows = await getDb().select().from(notices).orderBy(desc(notices.isImportant), desc(notices.createdAt)).limit(100);
    const scoped = rows.filter((row) => !row.destinationId || row.destinationId === destinationId);
    const active = scoped.filter((row) => isPublished(row, new Date().toISOString()));
    return Response.json({ notices: active, isAdmin: admin, adminNotices: admin ? rows : undefined });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!(await isSiteAdmin())) return Response.json({ error: "관리자 계정으로 로그인해 주세요." }, { status: 403 });
  try {
    const payload = (await request.json()) as NoticePayload;
    const [row] = await getDb().insert(notices).values({ id: crypto.randomUUID(), ...(await values(payload)) }).returning();
    return Response.json({ notice: row }, { status: 201 });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request) {
  if (!(await isSiteAdmin())) return Response.json({ error: "관리자 계정으로 로그인해 주세요." }, { status: 403 });
  try {
    const payload = (await request.json()) as NoticePayload;
    const id = clean(payload.id, 80);
    if (!id) return Response.json({ error: "수정할 공지를 선택해 주세요." }, { status: 400 });
    const [row] = await getDb().update(notices).set({ ...(await values(payload)), updatedAt: new Date().toISOString() }).where(eq(notices.id, id)).returning();
    if (!row) return Response.json({ error: "공지를 찾지 못했습니다." }, { status: 404 });
    return Response.json({ notice: row });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  if (!(await isSiteAdmin())) return Response.json({ error: "관리자 계정으로 로그인해 주세요." }, { status: 403 });
  try {
    const payload = (await request.json()) as NoticePayload;
    const id = clean(payload.id, 80);
    if (!id) return Response.json({ error: "삭제할 공지를 선택해 주세요." }, { status: 400 });
    await getDb().delete(notices).where(eq(notices.id, id));
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
