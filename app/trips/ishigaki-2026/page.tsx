"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import IshigakiScheduleManager from "./schedule-manager";
import WeatherCard from "./weather-card";
import DiveLogManager from "./dive-log-manager";
import AppendixManager from "./appendix-manager";
import UnderwaterGallery from "./underwater-gallery";
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
  category: "schedule" | "flight" | "stay" | "activity" | "food";
  date: string;
  time: string;
  title: string;
  location: string;
  note: string;
};

type Traveler = {
  id: string;
  name: string;
  gender: "male" | "female" | "unspecified";
  flightStatus: "confirmed" | "pending" | "separate";
  flightNote: string;
  hotelStatus: "vessel" | "shared" | "other" | "pending";
  hotelNote: string;
  diveDays: string[];
  certification: string;
  gearRental: "none" | "some" | "full";
  note: string;
  sortOrder: number;
  createdAt: string;
};

type TravelerForm = Omit<Traveler, "id" | "sortOrder" | "createdAt"> & { pin: string };
type PreviousTraveler = Pick<Traveler, "id" | "name" | "gender" | "certification"> & { destinationName: string };
type TripTab = "schedule" | "participants" | "points" | "logs" | "creatures" | "appendix";

const emptyForm: TravelerForm = {
  name: "",
  gender: "unspecified",
  flightStatus: "confirmed",
  flightNote: "",
  hotelStatus: "vessel",
  hotelNote: "",
  diveDays: [],
  certification: "어드밴스드",
  gearRental: "none",
  note: "",
  pin: "",
};

const flightLabels = {
  confirmed: "항공 예약 완료",
  pending: "예약 확인 중",
  separate: "개별 이동",
};

const hotelLabels = {
  vessel: "숙소 예약 완료",
  shared: "일행 객실에 합류",
  other: "다른 숙소 이용",
  pending: "숙소 확인 중",
};

function formatDiveDays(days: string[]) {
  return days.length ? days.map((day) => /^\d{4}-/.test(day) ? day.slice(5).replace("-", "/") : day).join(" · ") : "다이빙 미참여 / 미정";
}

function formatShortDate(value: string) {
  if (!value) return "TBD";
  const date = new Date(`${value}T00:00:00`);
  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function dateRange(items: TripItem[]) {
  const dates = [...new Set(items.map((item) => item.date).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
  return { start: dates[0] || "", end: dates.at(-1) || "" };
}

export default function Home({ tripId = "ishigaki-2026" }: { tripId?: string }) {
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [previousTravelers, setPreviousTravelers] = useState<PreviousTraveler[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [tripItems, setTripItems] = useState<TripItem[]>([]);
  const [form, setForm] = useState<TravelerForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previousTravelerId, setPreviousTravelerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [draggingTravelerId, setDraggingTravelerId] = useState<string | null>(null);
  const [dragOverTravelerId, setDragOverTravelerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TripTab>("schedule");
  const [now] = useState(() => Date.now());

  const range = useMemo(() => dateRange(tripItems), [tripItems]);
  const diveDates = useMemo(() => {
    if (!range.start) return [];
    const start = new Date(`${range.start}T00:00:00`);
    const end = new Date(`${range.end || range.start}T00:00:00`);
    const dates: Date[] = [];
    for (let cursor = new Date(start); cursor <= end && dates.length < 20; cursor.setDate(cursor.getDate() + 1)) dates.push(new Date(cursor));
    const activityDates = dates.length > 2 ? dates.slice(1, -1) : dates;
    return activityDates.map((date) => {
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return {
        value: tripId === "ishigaki-2026" ? `${date.getMonth() + 1}/${date.getDate()}` : iso,
        label: `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`,
        day: new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(date),
      };
    });
  }, [range.end, range.start, tripId]);

  const summary = useMemo(
    () => ({
      travelers: travelers.length,
      male: travelers.filter((item) => item.gender === "male").length,
      female: travelers.filter((item) => item.gender === "female").length,
      unspecified: travelers.filter((item) => item.gender !== "male" && item.gender !== "female").length,
      flights: travelers.filter((item) => item.flightStatus === "confirmed").length,
      divers: travelers.filter((item) => item.diveDays.length > 0).length,
    }),
    [travelers],
  );

  const flightGroups = useMemo(() => {
    const groups = new Map<string, { label: string; travelers: Traveler[] }>();
    travelers.forEach((traveler) => {
      if (traveler.flightStatus !== "confirmed" || !traveler.flightNote.trim()) return;
      const label = traveler.flightNote.trim();
      const key = label.replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
      const group = groups.get(key) || { label, travelers: [] };
      group.travelers.push(traveler);
      groups.set(key, group);
    });
    return [...groups.values()].sort((first, second) => second.travelers.length - first.travelers.length || first.label.localeCompare(second.label, "ko"));
  }, [travelers]);

  const loadTravelers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/travelers?destinationId=${encodeURIComponent(tripId)}`, { cache: "no-store" });
      const data = (await response.json()) as { travelers?: Traveler[]; previousTravelers?: PreviousTraveler[]; isAdmin?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "참가자 정보를 불러오지 못했습니다.");
      setTravelers(data.travelers || []);
      setPreviousTravelers(data.previousTravelers || []);
      setIsAdmin(Boolean(data.isAdmin));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  const loadTrip = useCallback(async () => {
    try {
      const response = await fetch(`/api/trips/${tripId}`, { cache: "no-store" });
      const data = (await response.json()) as { destination?: Destination; items?: TripItem[]; error?: string };
      if (!response.ok || !data.destination) throw new Error(data.error || "여행 정보를 불러오지 못했습니다.");
      setDestination(data.destination);
      setTripItems(data.items || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "여행 정보를 불러오지 못했습니다.");
    }
  }, [tripId]);

  const handleItemsChange = useCallback((items: TripItem[]) => setTripItems(items), []);

  async function persistTravelerOrder(nextTravelers: Traveler[]) {
    const orderedTravelers = nextTravelers.map((traveler, sortOrder) => ({ ...traveler, sortOrder }));
    setTravelers(orderedTravelers);
    setSaving(true);
    setNotice("참가자 순서를 저장하는 중…");
    try {
      const response = await fetch("/api/travelers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationId: tripId, travelerIds: orderedTravelers.map((traveler) => traveler.id) }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "참가자 순서를 저장하지 못했습니다.");
      setNotice("참가자 순서가 저장되었습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "참가자 순서를 저장하지 못했습니다.");
      await loadTravelers();
    } finally {
      setSaving(false);
    }
  }

  function reorderedTravelers(sourceId: string, targetId: string) {
    const nextTravelers = [...travelers];
    const sourceIndex = nextTravelers.findIndex((traveler) => traveler.id === sourceId);
    const targetIndex = nextTravelers.findIndex((traveler) => traveler.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return null;
    const [movedTraveler] = nextTravelers.splice(sourceIndex, 1);
    nextTravelers.splice(targetIndex, 0, movedTraveler);
    return nextTravelers;
  }

  function dropTraveler(targetId: string) {
    const nextTravelers = draggingTravelerId ? reorderedTravelers(draggingTravelerId, targetId) : null;
    setDraggingTravelerId(null);
    setDragOverTravelerId(null);
    if (nextTravelers) void persistTravelerOrder(nextTravelers);
  }

  function moveTraveler(travelerId: string, direction: -1 | 1) {
    const index = travelers.findIndex((traveler) => traveler.id === travelerId);
    const target = travelers[index + direction];
    if (index < 0 || !target) return;
    const nextTravelers = reorderedTravelers(travelerId, target.id);
    if (nextTravelers) void persistTravelerOrder(nextTravelers);
  }

  async function resetTravelerPin(traveler: Traveler) {
    const pin = window.prompt(`${traveler.name}님의 새 수정용 PIN 숫자 4자리를 입력해 주세요.`)?.trim() || "";
    if (!/^\d{4}$/.test(pin)) {
      if (pin) setNotice("새 PIN은 숫자 4자리로 입력해 주세요.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/travelers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationId: tripId,
          resetPinForId: traveler.id,
          pin,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "PIN을 재설정하지 못했습니다.");
      setNotice(`${traveler.name}님의 수정용 PIN이 재설정되었습니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "PIN을 재설정하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTravelers();
      void loadTrip();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTravelers, loadTrip]);

  function updateField<K extends keyof TravelerForm>(key: K, value: TravelerForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleDiveDay(value: string) {
    setForm((current) => ({
      ...current,
      diveDays: current.diveDays.includes(value)
        ? current.diveDays.filter((day) => day !== value)
        : [...current.diveDays, value],
    }));
  }

  async function submitTraveler(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    const needsPin = !editingId || !isAdmin;
    if (needsPin && !/^\d{4}$/.test(form.pin)) {
      setNotice("수정용 PIN은 숫자 4자리로 입력해 주세요.");
      return;
    }
    if (form.gender === "unspecified") {
      setNotice("성별을 선택해 주세요.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/travelers", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { ...form, id: editingId, destinationId: tripId } : { ...form, destinationId: tripId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "저장하지 못했습니다.");
      setForm(emptyForm);
      setEditingId(null);
      setPreviousTravelerId("");
      setNotice(editingId ? "예약 정보가 업데이트되었습니다." : "여행 정보가 함께 저장되었습니다.");
      await loadTravelers();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(traveler: Traveler) {
    setEditingId(traveler.id);
    setPreviousTravelerId("");
    setForm({
      name: traveler.name,
      gender: traveler.gender,
      flightStatus: traveler.flightStatus,
      flightNote: traveler.flightNote,
      hotelStatus: traveler.hotelStatus,
      hotelNote: traveler.hotelNote,
      diveDays: traveler.diveDays,
      certification: traveler.certification,
      gearRental: traveler.gearRental,
      note: traveler.note,
      pin: "",
    });
    setNotice(isAdmin ? "관리자 권한으로 PIN 없이 수정·삭제할 수 있어요." : "처음 저장할 때 만든 PIN을 입력하면 수정할 수 있어요.");
    document.getElementById("join-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteTraveler() {
    if (!editingId) {
      setNotice("삭제할 참가자 정보를 확인해 주세요.");
      return;
    }
    if (!isAdmin && !/^\d{4}$/.test(form.pin)) {
      setNotice("삭제하려면 수정용 PIN 숫자 4자리를 입력해 주세요.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/travelers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, pin: form.pin, destinationId: tripId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "삭제하지 못했습니다.");
      setForm(emptyForm);
      setEditingId(null);
      setPreviousTravelerId("");
      setNotice("입력한 정보가 삭제되었습니다.");
      await loadTravelers();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  const isIshigaki = tripId === "ishigaki-2026";
  const destinationName = destination?.name || (isIshigaki ? "Ishigaki" : "Ocean Trip");
  const destinationYear = destination?.year || "2026";
  const destinationMonth = normalizeMonth(destination?.month) || destination?.month || "TBD";
  const stayPlan = tripItems.find((item) => item.category === "stay");
  const activityPlan = tripItems.find((item) => item.category === "activity");
  const durationDays = range.start && range.end
    ? Math.max(1, Math.round((new Date(`${range.end}T00:00:00`).getTime() - new Date(`${range.start}T00:00:00`).getTime()) / 86_400_000) + 1)
    : null;
  const brandLabel = `${destinationName.toUpperCase()} ’${destinationYear.slice(-2)}`;
  const heroDateLabel = range.start
    ? `${formatShortDate(range.start)}${range.end && range.end !== range.start ? ` — ${formatShortDate(range.end)}` : ""}`
    : destinationMonth;
  const tripStatus = !range.start
    ? "일정 준비 중"
    : now < new Date(`${range.start}T00:00:00+09:00`).getTime()
      ? "여행 계획"
      : now <= new Date(`${range.end || range.start}T23:59:59+09:00`).getTime()
        ? "여행 중"
        : "여행 완료";
  const tripTabs: { id: TripTab; label: string; mark: string }[] = [
    { id: "schedule", label: "전체 일정", mark: "▤" },
    { id: "participants", label: "참가자", mark: "◎" },
    { id: "points", label: "다이브 포인트", mark: "⌖" },
    { id: "logs", label: "다이브 로그", mark: "▧" },
    { id: "creatures", label: "수중 기록", mark: "◇" },
    { id: "appendix", label: "Appendix", mark: "▱" },
  ];

  function selectTripTab(tab: TripTab) {
    setActiveTab(tab);
    if (tab === "participants") void loadTravelers();
  }

  function loadPreviousTravelerBasics(id: string) {
    setPreviousTravelerId(id);
    const traveler = previousTravelers.find((item) => item.id === id);
    if (!traveler) return;
    setForm((current) => ({
      ...current,
      name: traveler.name,
      gender: traveler.gender,
      certification: traveler.certification,
    }));
    setNotice(`${traveler.name}님의 이름, 성별, 다이빙 자격을 불러왔습니다.`);
  }

  return (
    <main className="editorial-trip">
      <header className="atlas-detail-nav">
        <Link className="atlas-detail-brand" href="/" aria-label="전체 여행 지도">
          <span className="atlas-submarine" aria-hidden="true"><i /><b /></span>
          <strong>JADAMO OCEAN</strong><em>Trip</em>
        </Link>
        <Link className="atlas-back" href="/">← 오션 트립 지도로</Link>
      </header>

      <section className="atlas-trip-hero" id="top">
        <div className="atlas-compass" aria-hidden="true"><span>N</span><i /><b /></div>
        <div className="atlas-trip-copy">
          <p>{destinationName.toUpperCase()} · {destinationMonth} {destinationYear}</p>
          <h1>{destinationName} 다이빙 트립</h1>
          <div><strong>{heroDateLabel}</strong><span>{tripStatus}</span></div>
        </div>
        <div className="atlas-trip-coordinate">
          <span>DESTINATION COORDINATES</span>
          <strong>{destination ? `${Math.abs(destination.latitude).toFixed(2)}° ${destination.latitude >= 0 ? "N" : "S"}` : "—"}</strong>
          <strong>{destination ? `${Math.abs(destination.longitude).toFixed(2)}° ${destination.longitude >= 0 ? "E" : "W"}` : "—"}</strong>
        </div>
        <span className="atlas-route-line" aria-hidden="true" />
      </section>

      <nav className="atlas-trip-tabs" aria-label="여행 상세 메뉴">
        {tripTabs.map((tab) => (
          <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} onClick={() => selectTripTab(tab.id)}>
            <span aria-hidden="true">{tab.mark}</span>{tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "schedule" && (
        <div className="atlas-tab-content">
          <section className="trip-ribbon" aria-label="여행 핵심 정보">
            <div><span>ROUTE</span><strong>Seoul → {destinationName}</strong></div>
            <div><span>STAY</span><strong>{stayPlan?.title || (isIshigaki ? "Vessel Hotel" : "To be decided")}</strong></div>
            <div><span>OCEAN PLAN</span><strong>{activityPlan?.title || (isIshigaki ? "Marinchu" : "Build together")}</strong></div>
            <div><span>DURATION</span><strong>{durationDays ? `${Math.max(0, durationDays - 1)} nights · ${durationDays} days` : "Dates to be added"}</strong></div>
          </section>
          {destination && <WeatherCard destinationId={tripId} destinationName={destinationName} tripStart={range.start} tripEnd={range.end || range.start} latitude={destination.latitude} longitude={destination.longitude} />}
          <section className="journey section-shell" id="journey">
            <div className="section-heading">
              <div><p className="eyebrow dark">THE JOURNEY</p><h2>섬에 도착하는 순간부터.</h2></div>
              <p>기본 일정과 확정된 예약을 한곳에서 추가하고, 원하는 순서로 정리할 수 있습니다.</p>
            </div>
            <IshigakiScheduleManager tripId={tripId} onItemsChange={handleItemsChange} />
          </section>
        </div>
      )}

      {activeTab === "points" && <DiveLogManager destinationId={tripId} view="points" destination={destination} />}
      {activeTab === "logs" && <DiveLogManager destinationId={tripId} view="logs" destination={destination} />}
      {activeTab === "creatures" && <UnderwaterGallery destinationId={tripId} destinationName={destinationName} />}
      {activeTab === "appendix" && (
        <section className="atlas-appendix section-shell">
          <AppendixManager destinationId={tripId} destinationName={destinationName} showIshigakiGuide={isIshigaki} />
        </section>
      )}

      {activeTab === "participants" && <section className="together atlas-participants" id="together">
        <div className="section-shell together-shell">
          <div className="section-heading light">
            <div>
              <p className="eyebrow">TRAVEL TOGETHER</p>
              <h2>각자의 예약을,<br />하나의 여행으로.</h2>
            </div>
            <p>예약번호·여권번호는 입력하지 마세요. 일행에게 필요한 일정 정보만 안전하게 공유합니다.</p>
          </div>

          <div className="summary-row" aria-label="참가 현황 요약">
            <div className="participant-summary">
              <span className="summary-total"><strong>{summary.travelers}</strong><span>참가자</span></span>
              <span className="gender-counts" aria-label={`남성 ${summary.male}명, 여성 ${summary.female}명, 미정 ${summary.unspecified}명`}>
                <span className="is-male"><b>{summary.male}</b> 남</span>
                <span className="is-female"><b>{summary.female}</b> 여</span>
                <span className="is-unspecified"><b>{summary.unspecified}</b> 미정</span>
              </span>
            </div>
            <div><strong>{summary.flights}</strong><span>항공 예약 완료</span></div>
            <div><strong>{summary.divers}</strong><span>다이빙 참여</span></div>
          </div>

          <div className="collab-grid">
            <div className="travelers-panel">
              <div className="panel-title">
                <div><span className="live-dot" /> LIVE PLAN <small>끌어서 순서 변경</small></div>
                <button type="button" onClick={() => void loadTravelers()}>새로고침</button>
              </div>
              {flightGroups.length > 0 && (
                <section className="flight-groups" aria-label="같은 항공편으로 이동하는 일행">
                  <div className="flight-groups-heading"><span>✈</span><strong>같은 항공편</strong><small>항공편 정보가 같은 일행끼리 묶어 보여요</small></div>
                  <div className="flight-group-list">
                    {flightGroups.map((group) => (
                      <article className="flight-group" key={group.label}>
                        <div className="flight-group-route"><span>FLIGHT</span><strong>{group.label}</strong></div>
                        <div className="flight-group-people" aria-label={`${group.travelers.map((traveler) => traveler.name).join(", ")} 함께 이동`}>
                          {group.travelers.map((traveler) => <span className={`flight-group-avatar is-${traveler.gender}`} key={traveler.id}>{traveler.name.slice(0, 1)}</span>)}
                          <b>{group.travelers.map((traveler) => traveler.name).join(" · ")}</b>
                          <small>{group.travelers.length}명</small>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              {loading ? (
                <div className="empty-state">함께 가는 사람들의 정보를 불러오는 중…</div>
              ) : travelers.length === 0 ? (
                <div className="empty-state">
                  <span>첫 번째 여행자가 되어주세요.</span>
                  <p>오른쪽에서 항공·숙소·다이빙 계획을 입력하면 여기에 함께 표시됩니다.</p>
                </div>
              ) : (
                <div className="traveler-list">
                  {travelers.map((traveler, index) => (
                    <article
                      className={`traveler-card is-${traveler.gender} ${draggingTravelerId === traveler.id ? "is-dragging" : ""} ${dragOverTravelerId === traveler.id && draggingTravelerId !== traveler.id ? "is-drop-target" : ""}`}
                      key={traveler.id}
                      draggable={!saving}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", traveler.id);
                        setDraggingTravelerId(traveler.id);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOverTravelerId(traveler.id);
                      }}
                      onDrop={(event) => { event.preventDefault(); dropTraveler(traveler.id); }}
                      onDragEnd={() => { setDraggingTravelerId(null); setDragOverTravelerId(null); }}
                    >
                      <div className="traveler-drag-grip" aria-label={`${traveler.name} 참가자 이동`} title="끌어서 순서 변경"><span aria-hidden="true">⠿</span><small>{String(index + 1).padStart(2, "0")}</small></div>
                      <div className="traveler-top">
                        <div className={`avatar is-${traveler.gender}`}>{traveler.name.slice(0, 1)}</div>
                        <div><h3 aria-label={`${traveler.name}, 성별 ${traveler.gender === "male" ? "남성" : traveler.gender === "female" ? "여성" : "미정"}`}><span aria-hidden="true">{traveler.name}</span><small aria-hidden="true" className={`gender-badge is-${traveler.gender}`}>{traveler.gender === "male" ? "남" : traveler.gender === "female" ? "여" : "미정"}</small></h3><span>{flightLabels[traveler.flightStatus]}</span></div>
                        <div className="traveler-card-actions">
                          <div className="traveler-reorder-actions" aria-label="참가자 순서 변경">
                            <button type="button" disabled={saving || index === 0} onClick={() => moveTraveler(traveler.id, -1)} aria-label={`${traveler.name} 위로 이동`}>↑</button>
                            <button type="button" disabled={saving || index === travelers.length - 1} onClick={() => moveTraveler(traveler.id, 1)} aria-label={`${traveler.name} 아래로 이동`}>↓</button>
                          </div>
                          {isAdmin && <button type="button" disabled={saving} onClick={() => void resetTravelerPin(traveler)}>PIN 재설정</button>}
                          <button type="button" onClick={() => startEdit(traveler)}>수정</button>
                        </div>
                      </div>
                      <div className={`traveler-flight is-${traveler.flightStatus}`}>
                        <span>✈ FLIGHT</span>
                        <strong>{traveler.flightStatus === "confirmed" ? traveler.flightNote || "편명·시간 입력 대기" : flightLabels[traveler.flightStatus]}</strong>
                        {traveler.flightStatus === "confirmed" && traveler.flightNote && <small>{flightGroups.find((group) => group.travelers.some((member) => member.id === traveler.id))?.travelers.length || 1}명 함께 이동</small>}
                      </div>
                      <div className="traveler-details">
                        <div><span>STAY</span><strong>{hotelLabels[traveler.hotelStatus]}</strong><small>{traveler.hotelNote || "객실 메모 없음"}</small></div>
                        <div><span>DIVE</span><strong>{formatDiveDays(traveler.diveDays)}</strong><small>{traveler.certification} · 장비 {traveler.gearRental === "none" ? "대여 없음" : traveler.gearRental === "some" ? "일부 대여" : "전체 대여"}</small></div>
                      </div>
                      {traveler.note && (
                        <p className="traveler-note">{traveler.note}</p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>

            <form className="join-form" id="join-form" onSubmit={submitTraveler}>
              <div className="form-heading">
                <span>{editingId ? "EDIT MY PLAN" : "ADD MY PLAN"}</span>
                <h3>{editingId ? "내 예약 정보 수정" : "내 여행 정보 입력"}</h3>
                <p>일행이 일정 조율에 필요한 내용만 간단히 남겨주세요.</p>
              </div>

              {!editingId && previousTravelers.length > 0 && (
                <label className="field">
                  <span>이전 참가자 정보 불러오기</span>
                  <select value={previousTravelerId} onChange={(event) => loadPreviousTravelerBasics(event.target.value)}>
                    <option value="">이름과 다이빙 자격 선택</option>
                    {previousTravelers.map((traveler) => <option key={traveler.id} value={traveler.id}>{traveler.name} · {traveler.certification} · {traveler.destinationName}</option>)}
                  </select>
                  <small>다른 여행지의 기록도 선택할 수 있으며, 이름과 다이빙 자격만 입력란에 채웁니다.</small>
                </label>
              )}

              <div className="identity-row">
                <label className="field">
                  <span>이름 *</span>
                  <input required maxLength={20} value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="일행이 알아볼 이름" />
                </label>
                <fieldset className="field gender-field">
                  <legend>성별 *</legend>
                  <div className="gender-options">
                    <label className={`is-male ${form.gender === "male" ? "selected" : ""}`}><input type="radio" name="gender" value="male" checked={form.gender === "male"} onChange={() => updateField("gender", "male")} /><span>남자</span></label>
                    <label className={`is-female ${form.gender === "female" ? "selected" : ""}`}><input type="radio" name="gender" value="female" checked={form.gender === "female"} onChange={() => updateField("gender", "female")} /><span>여자</span></label>
                  </div>
                </fieldset>
              </div>

              <div className="field-row">
                <label className="field">
                  <span>항공편</span>
                  <select value={form.flightStatus} onChange={(event) => updateField("flightStatus", event.target.value as TravelerForm["flightStatus"])}>
                    <option value="confirmed">예약 완료</option>
                    <option value="pending">예약 확인 중</option>
                    <option value="separate">개별 이동</option>
                  </select>
                </label>
                <label className="field">
                  <span>숙소</span>
                  <select value={form.hotelStatus} onChange={(event) => updateField("hotelStatus", event.target.value as TravelerForm["hotelStatus"])}>
                    <option value="vessel">숙소 예약 완료</option>
                    <option value="shared">일행 객실에 합류</option>
                    <option value="other">다른 숙소 이용</option>
                    <option value="pending">확인 중</option>
                  </select>
                </label>
              </div>

              <label className="field">
                <span>항공편 정보</span>
                <input maxLength={80} value={form.flightNote} onChange={(event) => updateField("flightNote", event.target.value)} placeholder="예: LJxxx · 10/04 09:00 GMP → ISG (예약번호 제외)" />
                <small>같은 항공편은 편명·시간을 동일하게 입력하면 함께 묶여 보여요.</small>
              </label>

              <label className="field">
                <span>객실 메모</span>
                <input maxLength={60} value={form.hotelNote} onChange={(event) => updateField("hotelNote", event.target.value)} placeholder="동실자 또는 객실 구분" />
              </label>

              <fieldset className="field dive-field">
                <legend>활동·다이빙 참여일</legend>
                {diveDates.length ? <div className="date-options">
                  {diveDates.map((date) => (
                    <label key={date.value} className={form.diveDays.includes(date.value) ? "selected" : ""}>
                      <input type="checkbox" checked={form.diveDays.includes(date.value)} onChange={() => toggleDiveDay(date.value)} />
                      <strong>{date.label}</strong><span>{date.day}</span>
                    </label>
                  ))}
                </div> : <p className="date-options-empty">일정을 먼저 추가하면 선택 가능한 날짜가 표시됩니다.</p>}
              </fieldset>

              <div className="field-row">
                <label className="field">
                  <span>다이빙 자격</span>
                  <select value={form.certification} onChange={(event) => updateField("certification", event.target.value)}>
                    <option>체험 다이빙</option><option>오픈워터</option><option>어드밴스드</option><option>레스큐 이상</option><option>마스터</option><option>미정</option>
                  </select>
                </label>
                <label className="field">
                  <span>장비 대여</span>
                  <select value={form.gearRental} onChange={(event) => updateField("gearRental", event.target.value as TravelerForm["gearRental"])}>
                    <option value="none">대여 없음</option><option value="some">일부 대여</option><option value="full">전체 대여</option>
                  </select>
                </label>
              </div>

              <label className="field">
                <span>공유 메모</span>
                <textarea maxLength={160} value={form.note} onChange={(event) => updateField("note", event.target.value)} placeholder="픽업, 식사, 장비 등 일행이 알면 좋은 내용" />
              </label>

              {(!editingId || !isAdmin) ? (
                <label className="field pin-field">
                  <span>수정용 PIN *</span>
                  <input required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={form.pin} onChange={(event) => updateField("pin", event.target.value.replace(/\D/g, ""))} placeholder="숫자 4자리" />
                  <small>본인 정보의 수정·삭제에만 사용하며 화면에는 표시되지 않습니다.</small>
                </label>
              ) : (
                <p className="form-notice" role="status">관리자 권한으로 수정·삭제 중입니다. PIN은 필요하지 않습니다.</p>
              )}

              {notice && <p className="form-notice" role="status">{notice}</p>}
              <div className="form-actions">
                <button className="save-button" type="submit" disabled={saving}>{saving ? "저장 중…" : editingId ? "변경사항 저장" : "여행 계획 공유"}</button>
                {editingId && (
                  <>
                    <button className="cancel-button" type="button" onClick={() => { setEditingId(null); setPreviousTravelerId(""); setForm(emptyForm); setNotice(""); }}>취소</button>
                    <button className="delete-button" type="button" onClick={() => void deleteTraveler()} disabled={saving}>삭제</button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      </section>}

      <footer>
        <div className="footer-mark"><span className="brand-dot" /> {brandLabel}</div>
        <p>Good friends. Clear water. No rush.</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}
