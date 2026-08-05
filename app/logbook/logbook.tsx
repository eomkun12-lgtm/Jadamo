"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./logbook.module.css";
import mapStyles from "./map.module.css";

type Destination = { id: string; name: string; country: string; month: string; year: string; latitude: number; longitude: number };
type DiveLog = { id: string; destinationId: string; date: string; pointName: string; maxDepth: number | null; durationMinutes: number | null; buddies: string; creatures: string; note: string };
type Participant = { name: string; gender: "male" | "female" | "unspecified"; trips: { id: string }[] };

const ownerName = "엄경훈";
const coreDestination: Destination = { id: "ishigaki-2026", name: "Ishigaki", country: "Japan", month: "OCT", year: "2026", latitude: 24.34, longitude: 124.15 };
const parseBuddies = (value: string) => value.split(/[,/·\n]+/).map((name) => name.trim()).filter(Boolean);
const participantColor = (gender?: Participant["gender"]) => gender === "female" ? "#d98aa7" : gender === "male" ? "#5e9fd0" : "#79969f";

export default function Logbook() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [logs, setLogs] = useState<DiveLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBuddy, setSelectedBuddy] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/destinations", { cache: "no-store" });
        const data = (await response.json()) as { destinations?: Destination[] };
        const trips = [coreDestination, ...(data.destinations || []).filter((trip) => trip.id !== coreDestination.id)];
        const [results, participantsResponse] = await Promise.all([Promise.all(trips.map(async (trip) => {
          const logsResponse = await fetch(`/api/dive-logs?destinationId=${encodeURIComponent(trip.id)}`, { cache: "no-store" });
          const logsData = (await logsResponse.json()) as { logs?: DiveLog[] };
          return logsData.logs || [];
        })), fetch("/api/participants", { cache: "no-store" })]);
        const participantData = (await participantsResponse.json()) as { participants?: Participant[] };
        if (active) { setDestinations(trips); setLogs(results.flat()); setParticipants(participantData.participants || []); }
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  const tripsById = useMemo(() => new Map(destinations.map((trip) => [trip.id, trip])), [destinations]);
  const participantByName = useMemo(() => new Map(participants.map((person) => [person.name.trim().toLocaleLowerCase("ko"), person])), [participants]);
  const myTripIds = useMemo(() => new Set((participantByName.get(ownerName.toLocaleLowerCase("ko"))?.trips || []).map((trip) => trip.id)), [participantByName]);
  const myDestinationCount = destinations.filter((destination) => myTripIds.has(destination.id)).length;

  useEffect(() => {
    if (!mapReady) return;
    mapRef.current?.contentWindow?.postMessage({ type: "atlas-destinations", destinations: destinations.filter((trip) => myTripIds.has(trip.id)).map((trip) => ({ id: trip.id, name: trip.name, region: trip.country, latitude: trip.latitude, longitude: trip.longitude, month: trip.month, year: trip.year, href: `/trips/${trip.id}`, status: "completed" })) }, window.location.origin);
  }, [destinations, mapReady, myTripIds]);
  const buddies = useMemo(() => {
    const counts = new Map<string, number>();
    logs.forEach((log) => parseBuddies(log.buddies).forEach((buddy) => counts.set(buddy, (counts.get(buddy) || 0) + 1)));
    return [...counts.entries()].map(([name, dives]) => ({ name, dives, gender: participantByName.get(name.toLocaleLowerCase("ko"))?.gender })).sort((a, b) => b.dives - a.dives || a.name.localeCompare(b.name, "ko"));
  }, [logs, participantByName]);
  const filteredLogs = useMemo(() => selectedBuddy ? logs.filter((log) => parseBuddies(log.buddies).includes(selectedBuddy)) : logs, [logs, selectedBuddy]);
  const totalMinutes = logs.reduce((sum, log) => sum + (log.durationMinutes || 0), 0);
  const totalDepth = logs.reduce((sum, log) => sum + (log.maxDepth || 0), 0);

  return <main className={styles.page}>
    <header className={styles.nav}>
      <Link href="/" className={styles.brand}><img src="/jadamo-logo.png" alt="Jadamo" /> <span>JADAMO OCEAN</span></Link>
      <div className={styles.owner}><span className={styles.avatar}>엄</span><span><b>{ownerName}</b><small>ADMINISTRATOR</small></span></div>
      <Link href="/" className={styles.back}>여행 지도 ←</Link>
    </header>

    <section className={styles.hero}>
      <p>PRIVATE DIVE ARCHIVE · RECORDED BY {ownerName.toUpperCase()}</p><h1>{ownerName}의<br />다이빙 로그북</h1>
      <span><b>기록자 {ownerName}</b> · 장소와 사람으로 이어지는 나만의 바다 기록</span>
    </section>

    <section className={styles.stats} aria-label="다이빙 요약">
      <div><b>{logs.length}</b><span>기록한 다이빙</span></div>
      <div><b>{myDestinationCount}</b><span>참가한 여행지</span></div>
      <div><b>{buddies.length}</b><span>함께한 버디</span></div>
      <div><b>{totalMinutes ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` : "—"}</b><span>누적 잠수 시간</span></div>
    </section>

    <section className={mapStyles.dashboard}>
      <aside className={mapStyles.sideMenu}><p>ADMIN MENU</p><a className={mapStyles.active} href="#my-map">⌖ 내가 잠수한 곳</a><a href="#all-logs">▧ 나의 모든 다이빙</a><a href="#buddies">◎ 다이브 버디</a><div><span>RECORD OWNER</span><b>엄경훈</b></div></aside>
      <article className={mapStyles.mapCard} id="my-map"><header><div><p>MY DIVE MAP</p><h2>내가 잠수한 곳</h2></div><span>{myDestinationCount} PLACES</span></header><div className={mapStyles.mapFrame}><iframe ref={mapRef} title="엄경훈의 다이빙 방문 지도" src="/map.html" onLoad={() => setMapReady(true)} /></div><footer><span><i></i> 엄경훈 참가 여행지</span><b>다이브 로그와 연결된 장소</b></footer></article>
    </section>

    <section className={styles.content} id="buddies">
      <div className={styles.sectionHead}><div><p>YOUR DIVE BUDDIES</p><h2>사람으로 보는 로그</h2><small>다이빙 로그의 ‘동행 버디’에 직접 입력된 사람만 표시합니다.</small></div><span>{buddies.length} people</span></div>
      <div className={styles.buddyGrid}>
        <button className={`${styles.buddyCard} ${!selectedBuddy ? styles.selected : ""}`} onClick={() => setSelectedBuddy(null)}><i>⌁</i><b>전체 기록</b><small>{logs.length} dives</small></button>
        {buddies.slice(0, 7).map((buddy) => <button key={buddy.name} className={`${styles.buddyCard} ${selectedBuddy === buddy.name ? styles.selected : ""}`} onClick={() => setSelectedBuddy(selectedBuddy === buddy.name ? null : buddy.name)}><i style={{ background: participantColor(buddy.gender), color: "#fff" }}>{buddy.name.slice(0, 1)}</i><b>{buddy.name}</b><small>{buddy.dives}회 · 로그 동행 버디</small></button>)}
      </div>
    </section>

    <section className={styles.content} id="all-logs">
      <div className={styles.sectionHead}><div><p>ALL DIVE LOGS</p><h2>{selectedBuddy ? `${selectedBuddy}님과 함께한 로그` : "나의 모든 다이빙"}</h2></div><span>{totalDepth ? `TOTAL ${totalDepth.toFixed(1)}m` : ""}</span></div>
      {loading ? <div className={styles.empty}>기록을 불러오는 중입니다.</div> : filteredLogs.length ? <div className={styles.logList}>{filteredLogs.sort((a, b) => b.date.localeCompare(a.date)).map((log, index) => {
        const trip = tripsById.get(log.destinationId);
        const logBuddies = parseBuddies(log.buddies);
        const [year, month, day] = log.date.split("-");
        return <article className={styles.log} key={log.id}>
          <div className={styles.date}><strong>{month}.{day}</strong><span>{year}</span><small>#{String(index + 1).padStart(2, "0")}</small></div>
          <div className={styles.logMain}><p>{trip ? `${trip.country} · ${trip.name}` : "JADAMO OCEAN"}</p><h3>{log.pointName}</h3><span>RECORDED BY {ownerName}</span>{log.note && <small>{log.note}</small>}</div>
          <div className={styles.metric}><span>MAX DEPTH</span><b>{log.maxDepth ? `${log.maxDepth}m` : "—"}</b></div>
          <div className={styles.metric}><span>DIVE TIME</span><b>{log.durationMinutes ? `${log.durationMinutes}m` : "—"}</b></div>
          <div className={styles.buddyLine}><span>WITH</span><div>{logBuddies.length ? logBuddies.map((buddy) => <i key={buddy} style={{ background: participantColor(participantByName.get(buddy.toLocaleLowerCase("ko"))?.gender) }}>{buddy.slice(0, 1)}</i>) : <i>엄</i>}<b>{logBuddies.length ? log.buddies : "엄경훈 단독"}</b></div></div>
        </article>;
      })}</div> : <div className={styles.empty}><b>아직 등록된 다이빙 로그가 없습니다.</b><span>여행 상세 화면에서 첫 다이빙 기록을 추가해 보세요.</span></div>}
    </section>
  </main>;
}
