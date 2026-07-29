"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { monthNumber, normalizeMonth } from "../lib/month";
import styles from "./home.module.css";

type Trip = {
  id: string;
  href: string;
  month: string;
  year: string;
  title: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
};

type SavedDestination = Omit<Trip, "href"> & {
  region?: string;
  startDate?: string;
  endDate?: string;
};

type Participant = {
  name: string;
  gender: string;
  attendanceCount: number;
  trips: { id: string; name: string; month: string; year: string }[];
};

const featuredTrip: Trip = {
  id: "ishigaki-2026",
  href: "/trips/ishigaki-2026",
  month: "OCT",
  year: "2026",
  title: "Ishigaki",
  country: "일본",
  countryCode: "JP",
  latitude: 24.34,
  longitude: 124.15,
  startDate: "2026-10-04",
  endDate: "2026-10-08",
};

function countryFlag(code: string) {
  const normalized = code.trim().slice(0, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "";
  return String.fromCodePoint(
    ...[...normalized].map((letter) => 127397 + letter.charCodeAt(0)),
  );
}

function toTrip(item: SavedDestination): Trip {
  return {
    ...item,
    href: `/trips/${item.id}`,
    month: normalizeMonth(item.month) ?? item.month.toUpperCase(),
    startDate: item.startDate || "",
    endDate: item.endDate || "",
  };
}

function dateValue(trip: Trip) {
  const year = Number.parseInt(trip.year, 10);
  return (Number.isFinite(year) ? year : 9999) * 100 + (monthNumber(trip.month) ?? 99);
}

function tripState(trip: Trip, today: string) {
  if (!trip.startDate || !trip.endDate) return "planned";
  if (today < trip.startDate) return "planned";
  if (today > trip.endDate) return "completed";
  return "ongoing";
}

function displayDates(trip: Trip) {
  if (!trip.startDate || !trip.endDate) return `${trip.month} ${trip.year}`;
  const start = new Date(`${trip.startDate}T00:00:00`);
  const end = new Date(`${trip.endDate}T00:00:00`);
  return `${start.getMonth() + 1}.${String(start.getDate()).padStart(2, "0")} - ${end.getMonth() + 1}.${String(end.getDate()).padStart(2, "0")}, ${trip.year}`;
}

export default function TripAtlas() {
  const router = useRouter();
  const mapRef = useRef<HTMLIFrameElement>(null);
  const [saved, setSaved] = useState<SavedDestination[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const today = useMemo(
    () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10),
    [],
  );
  const trips = useMemo(
    () => [featuredTrip, ...saved.filter((trip) => trip.id !== featuredTrip.id).map(toTrip)].sort((a, b) => dateValue(a) - dateValue(b)),
    [saved],
  );
  const upcoming = trips.filter((trip) => tripState(trip, today) !== "completed");
  const countries = useMemo(
    () => [...new Map(trips.map((trip) => [trip.countryCode, trip])).values()],
    [trips],
  );

  useEffect(() => {
    fetch("/api/destinations", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((data: { destinations?: SavedDestination[]; isAdmin?: boolean }) => {
        setSaved(data.destinations || []);
        setIsAdmin(Boolean(data.isAdmin));
      })
      .catch(() => setError("여정 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    fetch("/api/participants", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((data: { participants?: Participant[] }) => setParticipants(data.participants || []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    mapRef.current?.contentWindow?.postMessage(
      {
        type: "atlas-destinations",
        destinations: trips.map((trip) => ({
          id: trip.id,
          name: trip.title,
          region: `${countryFlag(trip.countryCode)} ${trip.country}`,
          latitude: trip.latitude,
          longitude: trip.longitude,
          month: trip.month,
          year: trip.year,
          href: trip.href,
        })),
      },
      window.location.origin,
    );
  }, [trips]);

  function focusTrip(trip: Trip) {
    mapRef.current?.contentWindow?.postMessage(
      { type: "atlas-focus-trips", destinations: [{ id: trip.id, name: trip.title, latitude: trip.latitude, longitude: trip.longitude, href: trip.href }] },
      window.location.origin,
    );
    document.getElementById("ocean-map")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function saveDestination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      country: String(form.get("country") || ""),
      name: String(form.get("name") || ""),
      month: String(form.get("month") || ""),
      year: String(form.get("year") || ""),
    };
    try {
      const response = await fetch("/api/destinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { destination?: SavedDestination; error?: string };
      if (!response.ok || !data.destination) throw new Error(data.error || "여정을 저장하지 못했습니다.");
      setSaved((current) => [...current, data.destination!]);
      setFormOpen(false);
      router.push(`/trips/${data.destination.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "여정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <a className={styles.skip} href="#journeys">여정 목록으로 건너뛰기</a>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="JADAMO OCEAN ATLAS 홈">
          <img src="/jadamo-logo.png" alt="JADAMO Automotive Dive Crew" />
          <span>JADAMO OCEAN</span>
        </Link>
        <nav aria-label="주요 메뉴" className={styles.nav}>
          <a href="#journeys">여정</a>
          <a href="#ocean-map">지도</a>
          <a href="#crew">크루</a>
        </nav>
        <span className={styles.headerNote}>Dive travel journal</span>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <img src="/ishigaki-hero.png" alt="짙은 바다와 청록빛 산호초가 맞닿는 이시가키 해안" className={styles.heroImage} />
        <div className={styles.heroShade} />
        <div className={styles.heroContent}>
          <p className={styles.kicker}>JADAMO OCEAN ATLAS</p>
          <h1 id="hero-title">다음 물결을<br />기록합니다.</h1>
          <p className={styles.heroCopy}>바다를 좋아하는 사람들이 함께 만드는 다이빙 여행 아카이브.</p>
          <div className={styles.heroActions}>
            <Link href={featuredTrip.href} className={styles.primaryButton}>이시가키 여정 보기</Link>
            <a href="#journeys" className={styles.textButton}>모든 여정</a>
          </div>
        </div>
        <div className={styles.heroDetails}>
          <span>다음 여정</span>
          <strong>ISHIGAKI</strong>
          <p>2026.10.04 - 10.08</p>
        </div>
      </section>

      <section className={styles.overview} aria-label="아틀라스 현황">
        <div><strong>{String(trips.length).padStart(2, "0")}</strong><span>기록된 여정</span></div>
        <div><strong>{String(countries.length).padStart(2, "0")}</strong><span>함께한 나라</span></div>
        <div><strong>{String(participants.length).padStart(2, "0")}</strong><span>바다를 찾는 크루</span></div>
        <p>좋은 여행은 목적지를 넘어, 함께 잠수한 순간으로 남습니다.</p>
      </section>

      <section id="journeys" className={styles.journeys} aria-labelledby="journeys-title">
        <div className={styles.sectionIntro}>
          <p className={styles.kicker}>OUR JOURNEYS</p>
          <h2 id="journeys-title">계획에서 기억까지,<br />우리의 항로.</h2>
        </div>
        <div className={styles.journeyGrid}>
          {trips.map((trip, index) => (
            <article className={`${styles.tripCard} ${trip.id === featuredTrip.id ? styles.featuredCard : ""}`} key={trip.id}>
              <div className={styles.tripIndex}>{String(index + 1).padStart(2, "0")}</div>
              <p>{displayDates(trip)}</p>
              <h3>{trip.title}</h3>
              <span>{countryFlag(trip.countryCode)} {trip.country}</span>
              <div className={styles.tripCardFooter}>
                <button type="button" onClick={() => focusTrip(trip)}>지도에서 보기</button>
                <Link href={trip.href} aria-label={`${trip.title} 상세 보기`}>상세 보기</Link>
              </div>
            </article>
          ))}
          {isAdmin && <button type="button" className={styles.addTrip} onClick={() => setFormOpen(true)}>새 여정 추가</button>}
        </div>
        {error && <p className={styles.notice} role="alert">{error}</p>}
      </section>

      <section id="ocean-map" className={styles.mapSection} aria-labelledby="map-title">
        <div className={styles.mapCopy}>
          <p className={styles.kicker}>OCEAN MAP</p>
          <h2 id="map-title">우리가 닿은 바다를<br />한눈에.</h2>
          <p>목적지를 고르면 지도에서 위치를 확인할 수 있습니다.</p>
          <div className={styles.destinationList}>
            {upcoming.map((trip) => <button type="button" key={trip.id} onClick={() => focusTrip(trip)}>{countryFlag(trip.countryCode)} {trip.title}<span>{trip.year}</span></button>)}
          </div>
        </div>
        <div className={styles.mapFrame}>
          <iframe ref={mapRef} title="JADAMO OCEAN 여행 지도" src="/map.html" />
        </div>
      </section>

      <section id="crew" className={styles.crew} aria-labelledby="crew-title">
        <div className={styles.crewHeading}>
          <p className={styles.kicker}>THE CREW</p>
          <h2 id="crew-title">바다를 함께<br />기다리는 사람들.</h2>
        </div>
        <div className={styles.crewList}>
          {participants.length ? participants.slice(0, 6).map((person) => (
            <div key={person.name} className={styles.crewMember}>
              <span>{person.name.slice(0, 1)}</span>
              <div><strong>{person.name}</strong><p>{person.attendanceCount}개의 여정</p></div>
            </div>
          )) : <p className={styles.emptyCrew}>첫 여정을 함께할 크루를 기다리고 있습니다.</p>}
        </div>
      </section>

      <footer className={styles.footer}>
        <div><strong>JADAMO OCEAN</strong><span>Automotive Dive Crew</span></div>
        <p>바다를 따라, 우리의 여행은 계속됩니다.</p>
      </footer>

      {formOpen && (
        <div className={styles.dialogBackdrop} role="presentation">
          <form className={styles.dialog} onSubmit={saveDestination}>
            <button type="button" className={styles.close} onClick={() => setFormOpen(false)} aria-label="닫기">×</button>
            <p className={styles.kicker}>NEW JOURNEY</p>
            <h2>새로운 항로를<br />추가합니다.</h2>
            <label>국가<input name="country" required placeholder="예: 일본" /></label>
            <label>목적지<input name="name" required placeholder="예: Ishigaki" /></label>
            <div className={styles.dateFields}>
              <label>월<input name="month" required placeholder="예: OCT" /></label>
              <label>연도<input name="year" required inputMode="numeric" placeholder="예: 2026" /></label>
            </div>
            <button className={styles.primaryButton} disabled={saving} type="submit">{saving ? "저장 중" : "여정 저장"}</button>
          </form>
        </div>
      )}
    </main>
  );
}
