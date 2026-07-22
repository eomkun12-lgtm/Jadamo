"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { monthNumber, normalizeMonth } from "../lib/month";

type Trip = {
  id: string;
  href?: string;
  eyebrow: string;
  month: string;
  year: string;
  title: string;
  koreanTitle: string;
  description: string;
  coordinates: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
};

type SavedDestination = {
  id: string;
  name: string;
  region: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  month: string;
  year: string;
  startDate?: string;
  endDate?: string;
};

type Participant = {
  name: string;
  gender: string;
  attendanceCount: number;
  trips: { id: string; name: string; month: string; year: string }[];
};

function countryFlag(countryCode: string) {
  const code = countryCode.trim().slice(0, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌍";
  return String.fromCodePoint(
    ...[...code].map((letter) => 127397 + letter.charCodeAt(0)),
  );
}

const ishigaki: Trip = {
  id: "ishigaki-2026",
  href: "/trips/ishigaki-2026",
  eyebrow: "OCT 04 — 08 · 2026",
  month: "OCT",
  year: "2026",
  title: "Ishigaki",
  koreanTitle: `${countryFlag("jp")} 이시가키, 일본`,
  description: "마린츄와 함께하는 4박 5일의 섬과 바다.",
  coordinates: "24.34° N · 124.15° E",
  country: "일본",
  countryCode: "jp",
  latitude: 24.34,
  longitude: 124.15,
  startDate: "2026-10-04",
  endDate: "2026-10-08",
};

function toTrip(item: SavedDestination): Trip {
  const ns = item.latitude >= 0 ? "N" : "S";
  const ew = item.longitude >= 0 ? "E" : "W";
  const month = normalizeMonth(item.month) ?? item.month.toUpperCase();
  return {
    id: item.id,
    href: `/trips/${item.id}`,
    eyebrow: `${month} · ${item.year}`,
    month,
    year: item.year,
    title: item.name,
    koreanTitle: `${countryFlag(item.countryCode)} ${item.country}`,
    description: "다음 여행을 위해 지도에 저장한 목적지입니다.",
    coordinates: `${Math.abs(item.latitude).toFixed(2)}° ${ns} · ${Math.abs(item.longitude).toFixed(2)}° ${ew}`,
    country: item.country,
    countryCode: item.countryCode,
    latitude: item.latitude,
    longitude: item.longitude,
    startDate: item.startDate || "",
    endDate: item.endDate || "",
  };
}

function chronologicalTripValue(trip: Trip) {
  const year = Number.parseInt(trip.year, 10);
  const month = monthNumber(trip.month);
  return (Number.isFinite(year) ? year : 9999) * 100 + (month ?? 99);
}

type TripStatus = "planned" | "ongoing" | "completed";

function tripDateRange(trip: Trip) {
  if (trip.startDate && trip.endDate)
    return { start: trip.startDate, end: trip.endDate };
  const month = monthNumber(trip.month);
  const year = Number(trip.year);
  if (!month || !Number.isFinite(year))
    return { start: "9999-12-01", end: "9999-12-31" };
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${year}-${String(month).padStart(2, "0")}-${lastDay}`,
  };
}

function tripStatus(trip: Trip, today: string): TripStatus {
  const range = tripDateRange(trip);
  if (today < range.start) return "planned";
  if (today > range.end) return "completed";
  return "ongoing";
}

export default function TripAtlas() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [saved, setSaved] = useState<SavedDestination[]>([]);
  const [activeTrip, setActiveTrip] = useState(ishigaki.id);
  const [indexView, setIndexView] = useState<
    "journeys" | "countries" | "participants"
  >("journeys");
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(
    null,
  );
  const [selectedParticipantName, setSelectedParticipantName] = useState<
    string | null
  >(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingDestination, setEditingDestination] =
    useState<SavedDestination | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");
  const [today] = useState(() =>
    new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const trips = useMemo(
    () =>
      [ishigaki, ...saved.map(toTrip)].sort(
        (first, second) =>
          chronologicalTripValue(first) - chronologicalTripValue(second),
      ),
    [saved],
  );
  const journeyGroups = useMemo(() => {
    const grouped: Record<TripStatus, Trip[]> = {
      planned: [],
      ongoing: [],
      completed: [],
    };
    trips.forEach((trip) => grouped[tripStatus(trip, today)].push(trip));
    grouped.completed.reverse();
    return [
      { id: "planned", label: "여행 계획", eyebrow: "PLANNED", trips: grouped.planned },
      { id: "ongoing", label: "여행 중", eyebrow: "NOW TRAVELING", trips: grouped.ongoing },
      { id: "completed", label: "여행 완료", eyebrow: "COMPLETED", trips: grouped.completed },
    ] as const;
  }, [today, trips]);
  const active = trips.find((trip) => trip.id === activeTrip) ?? trips[0];
  const countries = useMemo(() => {
    const grouped = new Map<
      string,
      { name: string; code: string; trips: Trip[] }
    >();
    trips.forEach((trip) => {
      const key = trip.countryCode || trip.country;
      const group = grouped.get(key) ?? {
        name: trip.country,
        code: trip.countryCode,
        trips: [],
      };
      group.trips.push(trip);
      grouped.set(key, group);
    });
    return [...grouped.values()];
  }, [trips]);

  useEffect(() => {
    fetch("/api/destinations", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(
        (data: { destinations?: SavedDestination[]; isAdmin?: boolean }) => {
          setSaved(
            (data.destinations || []).filter((item) => item.id !== ishigaki.id),
          );
          setIsAdmin(Boolean(data.isAdmin));
        },
      )
      .catch(() => setError("저장된 목적지를 불러오지 못했습니다."));
  }, []);

  const loadParticipants = useCallback(() => {
    fetch("/api/participants", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { participants?: Participant[] }) =>
        setParticipants(data.participants || []),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadParticipants();
  }, [loadParticipants]);

  useEffect(() => {
    if (!mapReady) return;
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "atlas-destinations",
        destinations: trips.map(
          ({
            id,
            title,
            koreanTitle,
            latitude,
            longitude,
            month,
            year,
            href,
          }) => ({
            id,
            name: title,
            region: koreanTitle,
            latitude,
            longitude,
            month,
            year,
            href,
          }),
        ),
      },
      window.location.origin,
    );
  }, [mapReady, trips]);

  async function saveDestination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      country: form.get("country"),
      name: form.get("name"),
      month: form.get("month"),
      year: form.get("year"),
    };
    try {
      const response = await fetch("/api/destinations", {
        method: editingDestination ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingDestination
            ? { ...payload, id: editingDestination.id }
            : payload,
        ),
      });
      const data = (await response.json()) as {
        destination?: SavedDestination;
        error?: string;
      };
      if (!response.ok || !data.destination)
        throw new Error(data.error || "저장하지 못했습니다.");
      setSaved((current) =>
        editingDestination
          ? current.map((item) =>
              item.id === editingDestination.id ? data.destination! : item,
            )
          : [...current, data.destination!],
      );
      setActiveTrip(data.destination.id);
      setFormOpen(false);
      setEditingDestination(null);
      event.currentTarget.reset();
      if (!editingDestination) router.push(`/trips/${data.destination.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  function focusCountry(country: { code: string; trips: Trip[] }) {
    setSelectedCountryCode(country.code);
    setActiveTrip(country.trips[0].id);
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "atlas-focus-country",
        countryCode: country.code.toUpperCase(),
        countryName: country.trips[0].country,
        countryFlag: countryFlag(country.code),
        destinations: country.trips.map((trip) => ({
          latitude: trip.latitude,
          longitude: trip.longitude,
        })),
      },
      window.location.origin,
    );
  }

  function resetCountryView() {
    setSelectedCountryCode(null);
    iframeRef.current?.contentWindow?.postMessage(
      { type: "atlas-reset-view" },
      window.location.origin,
    );
  }

  function focusParticipant(participant: Participant) {
    const participantTrips = participant.trips
      .map((item) => trips.find((trip) => trip.id === item.id))
      .filter((trip): trip is Trip => Boolean(trip));
    setSelectedParticipantName(participant.name);
    if (participantTrips[0]) setActiveTrip(participantTrips[0].id);
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "atlas-focus-trips",
        participantName: participant.name,
        destinations: participantTrips.map((trip) => ({
          id: trip.id,
          name: trip.title,
          region: trip.koreanTitle,
          latitude: trip.latitude,
          longitude: trip.longitude,
          month: trip.month,
          year: trip.year,
          href: trip.href,
        })),
      },
      window.location.origin,
    );
  }

  function resetParticipantView() {
    setSelectedParticipantName(null);
    iframeRef.current?.contentWindow?.postMessage(
      { type: "atlas-reset-view" },
      window.location.origin,
    );
  }

  function openNewDestination() {
    setEditingDestination(null);
    setError("");
    setFormOpen(true);
  }

  function openEditDestination(destinationId: string) {
    const destination = saved.find((item) => item.id === destinationId);
    if (!destination) return;
    setEditingDestination(destination);
    setError("");
    setFormOpen(true);
  }

  async function deleteDestination(destinationId: string, name: string) {
    if (!window.confirm(`‘${name}’ 여행과 등록된 상세 일정을 모두 삭제할까요?`))
      return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/destinations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: destinationId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error || "여행지를 삭제하지 못했습니다.");
      setSaved((current) =>
        current.filter((item) => item.id !== destinationId),
      );
      if (activeTrip === destinationId) setActiveTrip(ishigaki.id);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "여행지를 삭제하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  function renderTripCard(trip: Trip) {
    const index = trips.findIndex((item) => item.id === trip.id);
    const content = (
      <>
        <div className="trip-card-number">{String(index + 1).padStart(2, "0")}</div>
        <div className="trip-card-date"><strong>{trip.month}</strong><span>{trip.year}</span></div>
        <div className="trip-card-copy"><span>{trip.eyebrow}</span><h3>{trip.title}</h3><p>{trip.koreanTitle}</p></div>
        <div className="trip-card-arrow" aria-hidden="true">{trip.href ? "↗" : "◎"}</div>
      </>
    );
    if (trip.id === ishigaki.id) {
      return <Link className={`trip-list-card ${activeTrip === trip.id ? "is-active" : ""}`} href={trip.href!} key={trip.id} onMouseEnter={() => setActiveTrip(trip.id)} onFocus={() => setActiveTrip(trip.id)}>{content}</Link>;
    }
    return <div className={`trip-list-entry ${activeTrip === trip.id ? "is-active" : ""}`} key={trip.id}>
      <Link className="trip-list-card" href={trip.href!} onMouseEnter={() => setActiveTrip(trip.id)} onFocus={() => setActiveTrip(trip.id)}>{content}</Link>
      {isAdmin && <div className="trip-list-manage"><button type="button" onClick={() => openEditDestination(trip.id)}>수정</button><button type="button" disabled={saving} onClick={() => void deleteDestination(trip.id, trip.title)}>삭제</button></div>}
    </div>;
  }

  return (
    <main className="atlas-page kdiver-atlas">
      <header className="atlas-nav">
        <Link
          className="atlas-brand"
          href="/"
          aria-label="JADAMO Ocean Atlas 여행 지도 홈"
        >
          <img className="atlas-brand-logo" src="/jadamo-logo.png" alt="JADAMO Automotive Dive Crew" />
          <span>JADAMO OCEAN ATLAS</span>
        </Link>
        <div className="atlas-nav-meta">
          <span>OUR JOURNEYS</span>
          <strong>{String(trips.length).padStart(2, "0")}</strong>
        </div>
      </header>

      <section className="atlas-shell">
        <div className="atlas-map-panel">
          <div className="atlas-intro">
            <p className="atlas-eyebrow">YAEYAMA ISLANDS · OCEAN MAP</p>
            <h1>
              섬과 바다를
              <br />
              한눈에.
            </h1>
            <p>해저 지형 위에서 이시가키 주변 섬과 여행 목적지를 탐색하세요.</p>
          </div>
          <div
            className="world-map live-atlas"
            aria-label="여행 목적지가 표시된 인터랙티브 지도"
          >
            <iframe
              ref={iframeRef}
              title="Esri와 GEBCO 데이터를 사용한 여행 지도"
              src="/map.html"
              onLoad={() => setMapReady(true)}
            />
          </div>
        </div>

        <aside className="trip-index" aria-label="여행 목록">
          <div className="trip-index-header">
            <div>
              <span>ISHIGAKI · YAEYAMA</span>
              <h2>오션 트립 지도</h2>
            </div>
            <span className="trip-count">{trips.length}</span>
          </div>
          <div className="atlas-tabs" role="tablist" aria-label="지도 탐색">
            <button
              type="button"
              className={indexView === "journeys" ? "is-active" : ""}
              role="tab"
              aria-selected={indexView === "journeys"}
              onClick={() => setIndexView("journeys")}
            >
              여행
            </button>
            <button
              type="button"
              className={indexView === "countries" ? "is-active" : ""}
              role="tab"
              aria-selected={indexView === "countries"}
              onClick={() => setIndexView("countries")}
            >
              국가
            </button>
            <button
              type="button"
              className={indexView === "participants" ? "is-active" : ""}
              role="tab"
              aria-selected={indexView === "participants"}
              onClick={() => {
                setIndexView("participants");
                loadParticipants();
              }}
            >
              참석자
            </button>
          </div>
          {indexView === "journeys" ? (
            <div className="trip-list">
              {journeyGroups.map((group) => (
                <section className={`trip-status-group is-${group.id}`} key={group.id} aria-labelledby={`trip-status-${group.id}`}>
                  <div className="trip-status-heading"><div><span>{group.eyebrow}</span><h3 id={`trip-status-${group.id}`}>{group.label}</h3></div><strong>{group.trips.length}</strong></div>
                  <div className="trip-status-list">{group.trips.length ? group.trips.map(renderTripCard) : <p className="trip-status-empty">해당하는 여행이 없습니다.</p>}</div>
                </section>
              ))}
            </div>
          ) : indexView === "countries" ? (
            <div className="country-list" role="list" aria-label="등록된 국가">
              {selectedCountryCode && (
                <button type="button" className="country-reset" onClick={resetCountryView}>
                  ← 모든 국가 보기
                </button>
              )}
              {countries.map((country) => {
                const isSelected = selectedCountryCode === country.code;
                return (
                  <div className={`country-group ${isSelected ? "is-open" : ""}`} key={country.code || country.name}>
                    <button
                      type="button"
                      role="listitem"
                      className={`country-card ${isSelected ? "is-active" : ""}`}
                      aria-expanded={isSelected}
                      onClick={() => isSelected ? resetCountryView() : focusCountry(country)}
                    >
                      <span className="country-card-flag" aria-hidden="true">
                        {countryFlag(country.code)}
                      </span>
                      <span className="country-card-copy">
                        <strong>{country.name}</strong>
                        <small>{country.trips.length}개의 목적지</small>
                      </span>
                      <span className="country-card-arrow" aria-hidden="true">
                        {isSelected ? "−" : "→"}
                      </span>
                    </button>
                    {isSelected && (
                      <div className="country-destinations" aria-label={`${country.name} 여행지`}>
                        <div className="country-destinations-head">
                          <span>DESTINATIONS</span>
                          <strong>{country.trips.length}</strong>
                        </div>
                        {country.trips.map((trip) => (
                          <Link
                            className="country-destination"
                            href={trip.href!}
                            key={trip.id}
                            onMouseEnter={() => setActiveTrip(trip.id)}
                            onFocus={() => setActiveTrip(trip.id)}
                          >
                            <span><b>{trip.title}</b><small>{trip.year} · {trip.month}</small></span>
                            <em>{tripStatus(trip, today) === "planned" ? "여행 계획" : tripStatus(trip, today) === "ongoing" ? "여행 중" : "여행 완료"}</em>
                            <i aria-hidden="true">↗</i>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className="participant-index"
              role="list"
              aria-label="여행 참석자별 참석 횟수"
            >
              <div className="participant-index-summary">
                <span>TRAVEL CREW</span>
                <strong>{participants.length}명</strong>
                <p>동일한 이름으로 등록된 여행을 한 번씩 집계합니다.</p>
              </div>
              {selectedParticipantName && (
                <button type="button" className="participant-reset" onClick={resetParticipantView}>
                  ← 모든 참석자 보기
                </button>
              )}
              {participants.length ? (
                participants.map((participant, index) => {
                  const isSelected = selectedParticipantName === participant.name;
                  const orderedTrips = [...participant.trips].sort(
                    (first, second) =>
                      Number(first.year) * 100 + (monthNumber(first.month) ?? 0) -
                      (Number(second.year) * 100 + (monthNumber(second.month) ?? 0)),
                  );
                  return (
                    <div className={`participant-group ${isSelected ? "is-open" : ""}`} key={`${participant.name}-${index}`}>
                      <button
                        type="button"
                        className={`participant-index-card is-${participant.gender} ${isSelected ? "is-active" : ""}`}
                        role="listitem"
                        aria-expanded={isSelected}
                        onClick={() => isSelected ? resetParticipantView() : focusParticipant(participant)}
                      >
                        <span className="participant-rank">{String(index + 1).padStart(2, "0")}</span>
                        <span className={`participant-avatar is-${participant.gender}`}>{participant.name.slice(0, 1)}</span>
                        <span className="participant-index-copy">
                          <strong>{participant.name}</strong>
                          <small>{participant.trips.map((trip) => `${trip.year.slice(-2)} ${trip.month} · ${trip.name}`).join("  /  ")}</small>
                        </span>
                        <span className="participant-count"><strong>{participant.attendanceCount}</strong><small>회 참석</small></span>
                      </button>
                      {isSelected && (
                        <section className="participant-passport" aria-label={`${participant.name} 여행 여권`}>
                          <div className="participant-passport-head">
                            <div><span>JADAMO OCEAN PASSPORT</span><h3>{participant.name}의 여행 기록</h3></div>
                            <b aria-hidden="true">✦</b>
                          </div>
                          <div className="participant-stamps">
                            <div><strong>{participant.attendanceCount}</strong><span>총 여행</span></div>
                            <div><strong>{orderedTrips[0]?.year.slice(-2) || "—"}</strong><span>첫 여행</span></div>
                            <div><strong>{orderedTrips.at(-1)?.year.slice(-2) || "—"}</strong><span>최근 여행</span></div>
                          </div>
                          <div className="participant-journeys">
                            {orderedTrips.map((participantTrip) => {
                              const trip = trips.find((item) => item.id === participantTrip.id);
                              return (
                                <Link className="participant-journey" href={trip?.href || `/trips/${participantTrip.id}`} key={participantTrip.id}>
                                  <span className="participant-journey-flag" aria-hidden="true">{trip ? countryFlag(trip.countryCode) : "🌊"}</span>
                                  <span><b>{participantTrip.name}</b><small>{participantTrip.year} · {participantTrip.month}</small></span>
                                  <em>{trip ? (tripStatus(trip, today) === "planned" ? "예정" : tripStatus(trip, today) === "ongoing" ? "여행 중" : "완료") : "여행"}</em>
                                  <i aria-hidden="true">↗</i>
                                </Link>
                              );
                            })}
                          </div>
                        </section>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="participant-index-empty">
                  아직 등록된 참석자가 없습니다.
                </div>
              )}
            </div>
          )}
          <div className="selected-trip">
            <span>SELECTED COUNTRY</span>
            <div className="selected-country">
              <span aria-hidden="true">{countryFlag(active.countryCode)}</span>
              <strong>{active.country}</strong>
            </div>
            <div>
              <strong>{active.coordinates}</strong>
              <p>{active.description}</p>
            </div>
          </div>

          {isAdmin &&
            (formOpen ? (
              <form
                className="destination-form"
                key={editingDestination?.id || "new"}
                onSubmit={saveDestination}
              >
                <div className="destination-form-head">
                  <div>
                    <span>
                      {editingDestination
                        ? "EDIT DESTINATION"
                        : "NEW DESTINATION"}
                    </span>
                    <strong>
                      {editingDestination ? "여행지 수정" : "다음 목적지 추가"}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormOpen(false);
                      setEditingDestination(null);
                    }}
                    aria-label="닫기"
                  >
                    ×
                  </button>
                </div>
                <label>
                  <span>나라</span>
                  <input
                    name="country"
                    required
                    defaultValue={editingDestination?.country || ""}
                    placeholder="예: 일본"
                    autoComplete="country-name"
                  />
                </label>
                <label>
                  <span>목적지</span>
                  <input
                    name="name"
                    required
                    defaultValue={editingDestination?.name || ""}
                    placeholder="예: 미야코지마"
                  />
                </label>
                <div className="destination-form-row">
                  <label>
                    <span>월</span>
                    <input
                      name="month"
                      required
                      inputMode="numeric"
                      pattern="0?[1-9]|1[0-2]"
                      maxLength={2}
                      defaultValue={
                        editingDestination
                          ? (monthNumber(editingDestination.month) ?? "")
                          : ""
                      }
                      placeholder="예: 8"
                      title="1부터 12까지 숫자로 입력해 주세요."
                    />
                  </label>
                  <label>
                    <span>연도</span>
                    <input
                      name="year"
                      required
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      defaultValue={editingDestination?.year || ""}
                      placeholder="2026"
                    />
                  </label>
                </div>
                <p className="geocoder-credit">
                  위치 검색 © OpenStreetMap contributors
                </p>
                {error && <p className="destination-error">{error}</p>}
                <button className="destination-save" disabled={saving}>
                  {saving
                    ? "저장 중…"
                    : editingDestination
                      ? "수정 내용 저장"
                      : "지도에 추가"}
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="future-note future-note-button"
                onClick={openNewDestination}
              >
                <span className="future-icon">＋</span>
                <p>
                  <strong>다음 목적지 추가</strong>
                  <br />
                  위치를 입력해 지도에 새 포인트를 만드세요.
                </p>
                <span className="future-arrow">→</span>
              </button>
            ))}
          {!formOpen && error && (
            <p className="destination-error standalone">{error}</p>
          )}
        </aside>
      </section>
    </main>
  );
}
