"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { validCoordinates, isGoogleMapsUrl, type PlaceCandidate } from "../../../lib/google-maps";
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
    month: "long",
    day: "numeric",
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [mapContext, setMapContext] = useState<MapContext | null>(null);
  const lookupId = useRef(0);
  const [locating, setLocating] = useState(false);
  const [placeNotice, setPlaceNotice] = useState("");
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [placeSource, setPlaceSource] = useState("");
  const [searchAddress, setSearchAddress] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/trips/${tripId}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { items?: TripItem[]; destination?: MapContext; isAdmin?: boolean; error?: string };
        if (!response.ok) throw new Error(data.error || "일정을 불러오지 못했습니다.");
        setItems(data.items || []);
        setIsAdmin(Boolean(data.isAdmin));
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
      (first.date || "9999").localeCompare(second.date || "9999") ||
      (first.sortOrder ?? 0) - (second.sortOrder ?? 0) || scheduleValue(first) - scheduleValue(second),
    ),
    [items],
  );
  const dates = [...new Set(sortedItems.map((item) => item.date))];
  const routeItems = useMemo(
    () => sortedItems.map((item, index) => ({ item, order: index + 1 })).filter(({ item }) => item.location.trim() || item.mapUrl || validCoordinates(item.latitude, item.longitude)),
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
    if (nextItems[sourceIndex].date !== nextItems[targetIndex].date) return null;
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

  function resetLookup() {
    lookupId.current++;
    setLocating(false);
    setCandidates([]);
    setPlaceNotice("");
    setPlaceSource("");
    setSearchAddress("");
  }

  function selectPlace(place: PlaceCandidate) {
    setForm(current => ({ ...current, latitude: place.latitude, longitude: place.longitude, location: current.location.trim() ? current.location : (place.address || place.name).slice(0, 100) }));
    setCandidates([]);
    setPlaceNotice(`위치 확인 완료: ${place.name}${place.address && place.address !== place.name ? " · " + place.address : ""}`);
  }

  async function lookupPlace(mapUrl: string, query = "") {
    const id = ++lookupId.current;
    setLocating(true);
    setCandidates([]);
    setPlaceNotice("장소 확인 중…");
    setForm(current => ({ ...current, latitude: null, longitude: null }));
    try {
      const response = await fetch("/api/maps/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mapUrl, query }) });
      const result = await response.json() as { error?: string; address?: string; candidates?: PlaceCandidate[]; source?: string };
      if (id !== lookupId.current) return;
      if (!response.ok) throw new Error(result.error || "장소를 확인하지 못했습니다.");
      setSearchAddress(result.address || query);
      setPlaceSource(result.source || "");
      const found = result.candidates || [];
      if (result.source === "link" && found.length === 1) selectPlace(found[0]);
      else {
        setCandidates(found);
        setPlaceNotice(found.length ? "주소를 확인하고 맞는 장소를 선택해 주세요." : "위치를 찾지 못했어요. 장소명이나 주소를 확인해 주세요. 일정은 그대로 저장할 수 있어요.");
      }
    } catch (error) {
      if (id === lookupId.current) setPlaceNotice(error instanceof Error ? error.message : "위치를 찾지 못했어요. 일정은 그대로 저장할 수 있어요.");
    } finally {
      if (id === lookupId.current) setLocating(false);
    }
  }

  useEffect(() => {
    if (!formOpen || !form.mapUrl || validCoordinates(form.latitude, form.longitude)) return;
    const timer = setTimeout(() => void lookupPlace(form.mapUrl), 500);
    return () => { clearTimeout(timer); lookupId.current++; };
    // Only a changed link starts a lookup; search text is submitted explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.mapUrl, formOpen]);

  function openNewForm() {
    resetLookup();
    setEditingId(null);
    setForm(emptyForm);
    setNotice("");
    setFormOpen(true);
  }

  function openEditForm(item: TripItem) {
    resetLookup();
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
          <h3>날짜별 일정</h3>
          <p>날짜를 눌러 하루 일정을 접고 펼쳐 보세요.{isAdmin && " 같은 날짜 안에서 카드를 끌거나 화살표로 순서를 바꿀 수 있어요."}</p>
        </div>
        {isAdmin && <div className="editable-schedule-head-actions">
          <button type="button" onClick={openNewForm}>＋ 일정 추가</button>
        </div>}
      </div>

      {notice && <p className="editable-schedule-notice">{notice}</p>}

      {loading ? (
        <div className="editable-schedule-empty">전체 일정을 불러오는 중…</div>
      ) : sortedItems.length ? (
        <>
        {routeItems.length > 0 && <section className="itinerary-route-map" aria-labelledby="itinerary-route-title">
          <div>
            <span>CHRONOLOGICAL ROUTE</span>
            <h4 id="itinerary-route-title">일정별 이동 흐름</h4>
            <p>확인된 장소를 일정 순서대로 연결한 선입니다. 실제 도보·자동차 길찾기 경로는 아닙니다.</p>
          </div>
          <iframe ref={mapRef} src="/itinerary-map.html" title="일정 순서대로 장소를 연결한 지도" onLoad={syncMap} />
        </section>}
        {dates.map((date) => (
        <details className="editable-schedule-day" key={date} open>
          <summary>{formatDate(date)} <span>{sortedItems.filter((item) => item.date === date).length}개 일정</span></summary>
          <div className="editable-schedule-list">
          {sortedItems.map((item, index) => item.date === date && (
            <article
              className={`editable-schedule-card ${categoryClass[item.category]} ${draggingId === item.id ? "is-dragging" : ""} ${dragOverId === item.id && draggingId !== item.id ? "is-drop-target" : ""}`}
              key={item.id}
              draggable={isAdmin && !saving}
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
                {(item.location || item.mapUrl) && (
                  <a href={isGoogleMapsUrl(item.mapUrl || "") ? item.mapUrl : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`} target="_blank" rel="noreferrer">
                    {item.location || "Google Maps에서 열기"} <span>지도 ↗</span>
                  </a>
                )}
                {(item.location || item.mapUrl) && !validCoordinates(item.latitude, item.longitude) && <p>위치 확인 필요 · 경로에서 제외됨 {isAdmin && <button type="button" onClick={() => openEditForm(item)}>위치 재검색</button>}</p>}
                {item.note && <p>{item.note}</p>}
              </div>
              {isAdmin && <div className="editable-schedule-actions">
                <div className="editable-schedule-reorder" aria-label="일정 순서 변경">
                  <button type="button" disabled={saving || sortedItems[index - 1]?.date !== date} onClick={() => moveItem(item.id, -1)} aria-label={`${item.title} 위로 이동`}>↑</button>
                  <button type="button" disabled={saving || sortedItems[index + 1]?.date !== date} onClick={() => moveItem(item.id, 1)} aria-label={`${item.title} 아래로 이동`}>↓</button>
                </div>
                <button type="button" onClick={() => openEditForm(item)}>수정</button>
                <button type="button" disabled={saving} onClick={() => void deleteItem(item.id)}>삭제</button>
              </div>}
            </article>
          ))}
        </div>
        </details>
        ))}
        </>
      ) : (
        <div className="editable-schedule-empty">
          <span>아직 등록된 일정이 없습니다.</span>
          {isAdmin && <button type="button" onClick={openNewForm}>첫 일정 추가하기</button>}
        </div>
      )}

      {formOpen && isAdmin && (
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
            <label><span>장소</span><input maxLength={100} value={form.location} onChange={(event) => { resetLookup(); setForm((current) => ({ ...current, location: event.target.value, latitude: null, longitude: null })); }} placeholder="지도에서 찾을 장소 또는 주소" /></label>
            <label><span>Google Maps 공유 링크</span><input type="url" maxLength={600} value={form.mapUrl} onChange={(event) => { resetLookup(); setForm((current) => ({ ...current, mapUrl: event.target.value.trim(), latitude: null, longitude: null })); }} placeholder="Google Maps의 공유 → 링크 복사" /></label>
            <div className="schedule-place-lookup">
              <p role="status" aria-live="polite">{placeNotice || (validCoordinates(form.latitude, form.longitude) ? "저장된 위치를 사용합니다." : "링크를 붙여넣으면 장소를 확인합니다. 주소로도 검색할 수 있어요.")}</p>
              <label><span>장소명·주소로 다시 검색</span><input maxLength={300} value={searchAddress} onChange={event => setSearchAddress(event.target.value)} placeholder={form.location || "상호와 지역 또는 상세 주소"} /></label>
              <button type="button" disabled={locating || (!searchAddress.trim() && !form.location.trim() && !form.mapUrl)} onClick={() => void lookupPlace(searchAddress.trim() || form.location.trim() ? "" : form.mapUrl, searchAddress.trim() || form.location.trim())}>{locating ? "장소 확인 중…" : "위치 검색"}</button>
              {candidates.map((place, index) => <button className="schedule-place-candidate" type="button" key={index} onClick={() => selectPlace(place)}><strong>{place.name}</strong><span>{place.address}</span><span>이 장소 선택</span></button>)}
              {placeSource === "OpenStreetMap" && <small>검색 제공: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></small>}
            </div>
            <label><span>메모</span><textarea maxLength={300} value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="예약 정보나 준비물을 적어 주세요." /></label>
            {notice && <p className="editable-schedule-form-notice">{notice}</p>}
            <button className="editable-schedule-save" disabled={saving || locating}>{saving ? "저장 중…" : editingId ? "수정 내용 저장" : "일정 저장"}</button>
          </form>
        </div>
      )}
      <TripCalendarPanel tripId={tripId} />
    </div>
  );
}
