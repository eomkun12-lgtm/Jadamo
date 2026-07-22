"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { normalizeMonth } from "../../../lib/month";

type Destination = {
  id: string;
  name: string;
  region: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  month: string;
  year: string;
};

type TripItem = {
  id: string;
  destinationId: string;
  category: "schedule" | "flight" | "stay" | "activity" | "food";
  date: string;
  time: string;
  title: string;
  location: string;
  note: string;
  createdAt: string;
};

const categoryLabels = {
  schedule: "일정",
  flight: "항공편",
  stay: "숙소",
  activity: "활동",
  food: "맛집",
};

const categoryMarks = {
  schedule: "●",
  flight: "✈",
  stay: "⌂",
  activity: "◇",
  food: "◌",
};

function countryFlag(countryCode: string) {
  const code = countryCode.trim().slice(0, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌍";
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)));
}

function itemTimestamp(item: TripItem) {
  if (!item.date) return Number.MAX_SAFE_INTEGER;
  const value = Date.parse(`${item.date}T${item.time || "23:59"}:00`);
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

function formatItemDate(item: TripItem) {
  if (!item.date) return "날짜 미정";
  const date = new Date(`${item.date}T00:00:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

export default function TripDetail({ tripId }: { tripId: string }) {
  const [destination, setDestination] = useState<Destination | null>(null);
  const [items, setItems] = useState<TripItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TripItem | null>(null);
  const [notice, setNotice] = useState("");

  const loadTrip = useCallback(async () => {
    try {
      const response = await fetch(`/api/trips/${tripId}`, { cache: "no-store" });
      const data = (await response.json()) as {
        destination?: Destination;
        items?: TripItem[];
        error?: string;
      };
      if (!response.ok || !data.destination) throw new Error(data.error || "여행 정보를 불러오지 못했습니다.");
      setDestination(data.destination);
      setItems(data.items || []);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "여행 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    // Fetching route-specific data is the external synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTrip();
  }, [loadTrip]);

  const sortedItems = useMemo(
    () => [...items].sort((first, second) => itemTimestamp(first) - itemTimestamp(second)),
    [items],
  );

  const counts = useMemo(
    () => ({
      flight: items.filter((item) => item.category === "flight").length,
      stay: items.filter((item) => item.category === "stay").length,
      activity: items.filter((item) => ["activity", "food"].includes(item.category)).length,
    }),
    [items],
  );

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      category: data.get("category"),
      date: data.get("date"),
      time: data.get("time"),
      title: data.get("title"),
      location: data.get("location"),
      note: data.get("note"),
    };

    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: editingItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingItem ? { ...payload, itemId: editingItem.id } : payload),
      });
      const result = (await response.json()) as { item?: TripItem; error?: string };
      if (!response.ok || !result.item) throw new Error(result.error || "일정을 저장하지 못했습니다.");
      setItems((current) => editingItem
        ? current.map((item) => item.id === editingItem.id ? result.item! : item)
        : [...current, result.item!],
      );
      form.reset();
      setFormOpen(false);
      setEditingItem(null);
      setNotice(editingItem ? "일정이 수정되었습니다." : "새 일정이 추가되었습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "일정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function openNewItem() {
    setEditingItem(null);
    setNotice("");
    setFormOpen(true);
  }

  function openEditItem(item: TripItem) {
    setEditingItem(item);
    setNotice("");
    setFormOpen(true);
  }

  async function deleteItem(itemId: string) {
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "일정을 삭제하지 못했습니다.");
      setItems((current) => current.filter((item) => item.id !== itemId));
      setNotice("일정이 삭제되었습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "일정을 삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="trip-template-state"><span className="trip-template-loader" /><p>여행 페이지를 준비하고 있어요.</p></main>;
  }

  if (!destination) {
    return (
      <main className="trip-template-state">
        <p>{notice || "여행지를 찾지 못했습니다."}</p>
        <Link href="/">여행 지도로 돌아가기</Link>
      </main>
    );
  }

  const month = normalizeMonth(destination.month) || destination.month;

  return (
    <main className="trip-template-page">
      <header className="trip-template-nav">
        <Link href="/" className="trip-template-back"><span>←</span> 전체 여행</Link>
        <span className="trip-template-wordmark">TRIP ATLAS</span>
        <button type="button" onClick={openNewItem}>＋ 일정 추가</button>
      </header>

      <section className="trip-template-hero">
        <div className="trip-template-hero-copy">
          <p>{month} · {destination.year} · {destination.country.toUpperCase()}</p>
          <h1>{destination.name}</h1>
          <div className="trip-template-location">
            <span aria-hidden="true">{countryFlag(destination.countryCode)}</span>
            <div><strong>{destination.country}</strong><small>{destination.region}</small></div>
          </div>
        </div>
        <div className="trip-template-coordinate">
          <span>DESTINATION COORDINATES</span>
          <strong>{Math.abs(destination.latitude).toFixed(2)}° {destination.latitude >= 0 ? "N" : "S"}</strong>
          <strong>{Math.abs(destination.longitude).toFixed(2)}° {destination.longitude >= 0 ? "E" : "W"}</strong>
          <div className="trip-template-rings"><i /><i /><i /><b /></div>
        </div>
      </section>

      <section className="trip-template-summary">
        <div><span>FLIGHTS</span><strong>{String(counts.flight).padStart(2, "0")}</strong><small>등록된 항공편</small></div>
        <div><span>STAYS</span><strong>{String(counts.stay).padStart(2, "0")}</strong><small>등록된 숙소</small></div>
        <div><span>THINGS TO DO</span><strong>{String(counts.activity).padStart(2, "0")}</strong><small>활동과 맛집</small></div>
      </section>

      <section className="trip-template-content">
        <div className="trip-template-section-head">
          <div><span>TRIP PLAN</span><h2>여행 일정</h2></div>
          <p>항공편, 숙소, 활동과 맛집을 한곳에 추가하면 날짜와 시간 순서대로 정리됩니다.</p>
        </div>

        {notice && <p className="trip-template-notice">{notice}</p>}

        {sortedItems.length ? (
          <div className="trip-template-timeline">
            {sortedItems.map((item, index) => (
              <article className="trip-template-item" key={item.id}>
                <div className="trip-template-item-index">{String(index + 1).padStart(2, "0")}</div>
                <div className={`trip-template-item-mark is-${item.category}`}>{categoryMarks[item.category]}</div>
                <div className="trip-template-item-time">
                  <strong>{formatItemDate(item)}</strong>
                  <span>{item.time || "시간 미정"}</span>
                </div>
                <div className="trip-template-item-copy">
                  <span>{categoryLabels[item.category]}</span>
                  <h3>{item.title}</h3>
                  {item.location && <p>{item.location}</p>}
                  {item.note && <small>{item.note}</small>}
                </div>
                <div className="trip-template-item-actions">
                  <button type="button" onClick={() => openEditItem(item)}>수정</button>
                  <button type="button" disabled={saving} onClick={() => void deleteItem(item.id)}>삭제</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="trip-template-empty">
            <span>✦</span>
            <h3>새 여행을 채워볼까요?</h3>
            <p>항공편이나 숙소처럼 이미 정해진 내용부터 추가해 보세요.</p>
            <button type="button" onClick={openNewItem}>첫 일정 추가하기</button>
          </div>
        )}
      </section>

      {formOpen && (
        <div className="trip-template-modal" role="dialog" aria-modal="true" aria-labelledby="trip-item-title">
          <button type="button" className="trip-template-scrim" onClick={() => setFormOpen(false)} aria-label="닫기" />
          <form className="trip-template-form" key={editingItem?.id || "new"} onSubmit={addItem}>
            <div className="trip-template-form-head">
              <div><span>{editingItem ? "EDIT PLAN" : "NEW PLAN"}</span><h2 id="trip-item-title">{editingItem ? "일정 수정" : "일정 추가"}</h2></div>
              <button type="button" onClick={() => { setFormOpen(false); setEditingItem(null); }} aria-label="닫기">×</button>
            </div>
            <label><span>종류</span><select name="category" defaultValue={editingItem?.category || "schedule"}><option value="schedule">일정</option><option value="flight">항공편</option><option value="stay">숙소</option><option value="activity">활동</option><option value="food">맛집</option></select></label>
            <div className="trip-template-form-row"><label><span>날짜</span><input type="date" name="date" defaultValue={editingItem?.date || ""} /></label><label><span>시간</span><input type="time" name="time" defaultValue={editingItem?.time || ""} /></label></div>
            <label><span>제목</span><input name="title" required maxLength={80} defaultValue={editingItem?.title || ""} placeholder="예: 제주공항 도착" /></label>
            <label><span>장소</span><input name="location" maxLength={100} defaultValue={editingItem?.location || ""} placeholder="예: 제주국제공항" /></label>
            <label><span>메모</span><textarea name="note" maxLength={300} defaultValue={editingItem?.note || ""} placeholder="예약 정보나 준비물을 적어 주세요." /></label>
            {notice && <p className="trip-template-form-notice">{notice}</p>}
            <button type="submit" className="trip-template-save" disabled={saving}>{saving ? "저장 중…" : editingItem ? "수정 내용 저장" : "일정 저장"}</button>
          </form>
        </div>
      )}
    </main>
  );
}
