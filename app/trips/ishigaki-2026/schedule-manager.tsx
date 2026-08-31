"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import TripCalendarPanel from "./calendar-panel";

type TripItem = {
  id: string;
  destinationId: string;
  category: "schedule" | "flight" | "stay" | "activity" | "food";
  date: string;
  time: string;
  title: string;
  location: string;
  mapUrl: string;
  latitude: number | null;
  longitude: number | null;
  note: string;
  sortOrder: number;
};

type ScheduleForm = Omit<TripItem, "id" | "destinationId" | "sortOrder">;
type MapContext = { latitude: number; longitude: number };

const emptyForm: ScheduleForm = {
  category: "schedule",
  date: "",
  time: "",
  title: "",
  location: "",
  mapUrl: "",
  latitude: null,
  longitude: null,
  note: "",
};

const categoryLabels = {
  schedule: "일정",
  flight: "항공편",
  stay: "숙소",
  activity: "투어·활동",
  food: "맛집",
};

const categoryClass = {
  schedule: "is-schedule",
  flight: "is-flight",
  stay: "is-stay",
  activity: "is-activity",
  food: "is-food",
};

function formatDate(value: string) {
  if (!value) return "날짜 미정";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(date);
}

function scheduleValue(item: TripItem) {
  if (!item.date) return Number.MAX_SAFE_INTEGER;
  const value = Date.parse(`${item.date}T${item.time || "23:59"}:00`);
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

export default function IshigakiScheduleManager({ tripId = "ishigaki-2026", onItemsChange }: { tripId?: string; onItemsChange?: (items: TripItem[]) => void }) {
  const mapRef = useRef<HTMLIFrameElement>(null);
  const [items, setItems] = useState<TripItem[]>([]);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [mapContext, setMapContext] = useState<MapContext | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/trips/${tripId}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { items?: TripItem[]; destination?: MapContext; error?: string };
        if (!response.ok) throw new Error(data.error || "일정을 불러오지 못했습니다.");
        setItems(data.items || []);
        setMapContext(data.destination || null);
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "일정을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [tripId]);

  useEffect(() => {
    onItemsChange?.(items);
  }, [items, onItemsChange]);

  const sortedItems = useMemo(
    () => [...items].sort((first, second) =>
      (first.sortOrder ?? 0) - (second.sortOrder ?? 0) || scheduleValue(first) - scheduleValue(second),
    ),
    [items],
  );
  const routeItems = useMemo(
    () => sortedItems.map((item, index) => ({ item, order: index + 1 })).filter(({ item }) => item.location.trim()),
    [sortedItems],
  );

  function syncMap() {
    mapRef.current?.contentWindow?.postMessage({
      type: "itinerary-route",
      context: mapContext,
      items: routeItems.map(({ item: { id, date, time, title, location, latitude, longitude }, order }) => ({ id, date, time, title, location, latitude, longitude, order })),
    }, window.location.origin);
  }

  useEffect(syncMap, [mapContext, routeItems]);

  async function persistOrder(nextItems: TripItem[]) {
    const orderedItems = nextItems.map((item, sortOrder) => ({ ...item, sortOrder }));
    setItems(orderedItems);
    setSaving(true);
    setNotice("새 순서를 저장하는 중…");
    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: orderedItems.map((item) => item.id) }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "순서를 저장하지 못했습니다.");
      setNotice("일정 순서가 저장되었습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "순서를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function reorderedItems(sourceId: string, targetId: string) {
    const nextItems = [...sortedItems];
    const sourceIndex = nextItems.findIndex((item) => item.id === sourceId);
    const targetIndex = nextItems.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return null;
    const [movedItem] = nextItems.splice(sourceIndex, 1);
    nextItems.splice(targetIndex, 0, movedItem);
    return nextItems;
  }

  function dropItem(targetId: string) {
    const nextItems = draggingId ? reorderedItems(draggingId, targetId) : null;
    setDraggingId(null);
    setDragOverId(null);
    if (nextItems) void persistOrder(nextItems);
  }

  function moveItem(itemId: string, direction: -1 | 1) {
    const index = sortedItems.findIndex((item) => item.id === itemId);
    const target = sortedItems[index + direction];
    if (index < 0 || !target) return;
    const nextItems = reorderedItems(itemId, target.id);
    if (nextItems) void persistOrder(nextItems);
  }

  function openNewForm() {
    setEditingId(null);
    setForm(emptyForm);
    setNotice("");
    setFormOpen(true);
  }

  function openEditForm(item: TripItem) {
    setEditingId(item.id);
    setForm({
      category: item.category,
      date: item.date,
      time: item.time,
      title: item.title,
      location: item.location,
      mapUrl: item.mapUrl || "",
      latitude: item.latitude ?? null,
      longitude: item.longitude ?? null,
      note: item.note,
    });
    setNotice("");
    setFormOpen(true);
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { ...form, itemId: editingId } : form),
      });
      const data = (await response.json()) as { item?: TripItem; error?: string; calendarWarning?: string; calendarSynced?: boolean };
      if (!response.ok || !data.item) throw new Error(data.error || "일정을 저장하지 못했습니다.");

      setItems((current) => editingId
        ? current.map((item) => item.id === editingId ? data.item! : item)
        : [...current, data.item!],
      );
      setFormOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setNotice(data.calendarWarning || (data.calendarSynced ? (editingId ? "일정이 수정되었고 Google Calendar에도 반영되었습니다." : "새 일정이 추가되었고 Google Calendar에도 반영되었습니다.") : (editingId ? "일정이 수정되었습니다." : "새 일정이 추가되었습니다.")));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "일정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(itemId: string) {
    const item = items.find((entry) => entry.id === itemId);
    if (!window.confirm(`‘${item?.title || "이 일정"}’을 삭제할까요?`)) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "일정을 삭제하지 못했습니다.");
      setItems((current) => current.filter((item) => item.id !== itemId));
      setNotice("일정이 삭제되었습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "일정을 삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editable-schedule">
      <div className="editable-schedule-head">
        <div>
          <span>ALL-IN-ONE ITINERARY</span>
          <h3>전체 일정 보드</h3>
          <p>기존 일정과 확정 일정을 한곳에서 관리해요. 카드를 끌어 원하는 일정 아래에 놓거나 모바일에서 화살표로 이동하세요.</p>
        </div>
        <div className="editable-schedule-head-actions">
          <button type="button" onClick={openNewForm}>＋ 일정 추가</button>
        </div>
      </div>

      {notice && <p className="editable-schedule-notice">{notice}</p>}

      {loading ? (
        <div className="editable-schedule-empty">전체 일정을 불러오는 중…</div>
      ) : sortedItems.length ? (
        <>
        {routeItems.length > 0 && <section className="itinerary-route-map" aria-labelledby="itinerary-route-title">
          <div>
            <span>CHRONOLOGICAL ROUTE</span>
            <h4 id="itinerary-route-title">시간순 이동 흐름</h4>
            <p>일정에 입력된 장소를 시간 순서대로 연결합니다.</p>
          </div>
          <iframe ref={mapRef} src="/itinerary-map.html" title="전체 일정의 시간순 이동 경로 지도" onLoad={syncMap} />
        </section>}
        <div className="editable-schedule-list">
          {sortedItems.map((item, index) => (
            <article
              className={`editable-schedule-card ${categoryClass[item.category]} ${draggingId === item.id ? "is-dragging" : ""} ${dragOverId === item.id && draggingId !== item.id ? "is-drop-target" : ""}`}
              key={item.id}
              draggable={!saving}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", item.id);
                setDraggingId(item.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverId(item.id);
              }}
              onDrop={(event) => { event.preventDefault(); dropItem(item.id); }}
              onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
            >
              <div className="editable-schedule-grip" aria-label={`${item.title} 일정 이동`} title="끌어서 순서 변경"><span aria-hidden="true">⠿</span><small>{String(index + 1).padStart(2, "0")}</small></div>
              <div className="editable-schedule-date">
                <strong>{formatDate(item.date)}</strong>
                <span>{item.time || "시간 미정"}</span>
              </div>
              <div className="editable-schedule-copy">
                <span>{categoryLabels[item.category]}</span>
                <h4>{item.title}</h4>
                {item.location && (
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`} target="_blank" rel="noreferrer">
                    {item.location} <span>지도 ↗</span>
                  </a>
                )}
                {item.note && <p>{item.note}</p>}
              </div>
              <div className="editable-schedule-actions">
                <div className="editable-schedule-reorder" aria-label="일정 순서 변경">
                  <button type="button" disabled={saving || index === 0} onClick={() => moveItem(item.id, -1)} aria-label={`${item.title} 위로 이동`}>↑</button>
                  <button type="button" disabled={saving || index === sortedItems.length - 1} onClick={() => moveItem(item.id, 1)} aria-label={`${item.title} 아래로 이동`}>↓</button>
                </div>
                <button type="button" onClick={() => openEditForm(item)}>수정</button>
                <button type="button" disabled={saving} onClick={() => void deleteItem(item.id)}>삭제</button>
              </div>
            </article>
          ))}
        </div>
        </>
      ) : (
        <div className="editable-schedule-empty">
          <span>아직 등록된 일정이 없습니다.</span>
          <button type="button" onClick={openNewForm}>첫 일정 추가하기</button>
        </div>
      )}

      {formOpen && (
        <div className="editable-schedule-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-form-title">
          <button type="button" className="editable-schedule-scrim" onClick={() => setFormOpen(false)} aria-label="닫기" />
          <form className="editable-schedule-form" onSubmit={saveItem}>
            <div className="editable-schedule-form-head">
              <div><span>{editingId ? "EDIT PLAN" : "NEW PLAN"}</span><h3 id="schedule-form-title">{editingId ? "일정 수정" : "일정 추가"}</h3></div>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="닫기">×</button>
            </div>
            <label><span>종류</span><select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as ScheduleForm["category"] }))}><option value="schedule">일정</option><option value="flight">항공편</option><option value="stay">숙소</option><option value="activity">투어·활동</option><option value="food">맛집</option></select></label>
            <div className="editable-schedule-form-row">
              <label><span>날짜</span><input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></label>
              <label><span>시간</span><input type="time" value={form.time} onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))} /></label>
            </div>
            <label><span>일정 이름</span><input required maxLength={80} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="예: 야이마무라 투어" /></label>
            <label><span>장소</span><input maxLength={100} value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} placeholder="지도에서 찾을 장소 또는 주소" /></label>
            <label><span>Google Maps 공유 링크</span><input type="url" maxLength={600} value={form.mapUrl} onChange={(event) => setForm((current) => ({ ...current, mapUrl: event.target.value }))} placeholder="Google Maps의 공유 → 링크 복사" /></label>
            <label><span>메모</span><textarea maxLength={300} value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="예약 정보나 준비물을 적어 주세요." /></label>
            {notice && <p className="editable-schedule-form-notice">{notice}</p>}
            <button className="editable-schedule-save" disabled={saving}>{saving ? "저장 중…" : editingId ? "수정 내용 저장" : "일정 저장"}</button>
          </form>
        </div>
      )}
      <TripCalendarPanel tripId={tripId} />
    </div>
  );
}
