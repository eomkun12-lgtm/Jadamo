"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./logbook.module.css";

type Destination = { id: string; name: string; country: string; month: string; year: string };
type DiveLog = { id: string; destinationId: string; date: string; pointName: string; maxDepth: number | null; durationMinutes: number | null; buddies: string; creatures: string; note: string };

const ownerName = "엄경훈";
const coreDestination: Destination = { id: "ishigaki-2026", name: "Ishigaki", country: "Japan", month: "OCT", year: "2026" };
const parseBuddies = (value: string) => value.split(/[,/·\n]+/).map((name) => name.trim()).filter(Boolean);

export default function Logbook() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [logs, setLogs] = useState<DiveLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBuddy, setSelectedBuddy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/destinations", { cache: "no-store" });
        const data = (await response.json()) as { destinations?: Destination[] };
        const trips = [coreDestination, ...(data.destinations || []).filter((trip) => trip.id !== coreDestination.id)];
        const results = await Promise.all(trips.map(async (trip) => {
          const logsResponse = await fetch(`/api/dive-logs?destinationId=${encodeURIComponent(trip.id)}`, { cache: "no-store" });
          const logsData = (await logsResponse.json()) as { logs?: DiveLog[] };
          return logsData.logs || [];
        }));
        if (active) { setDestinations(trips); setLogs(results.flat()); }
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  const tripsById = useMemo(() => new Map(destinations.map((trip) => [trip.id, trip])), [destinations]);
  const buddies = useMemo(() => {
    const counts = new Map<string, number>();
    logs.forEach((log) => parseBuddies(log.buddies).forEach((buddy) => counts.set(buddy, (counts.get(buddy) || 0) + 1)));
    return [...counts.entries()].map(([name, dives]) => ({ name, dives })).sort((a, b) => b.dives - a.dives || a.name.localeCompare(b.name, "ko"));
  }, [logs]);
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
      <div><b>{destinations.length}</b><span>방문한 여행지</span></div>
      <div><b>{buddies.length}</b><span>함께한 버디</span></div>
      <div><b>{totalMinutes ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` : "—"}</b><span>누적 잠수 시간</span></div>
    </section>

    <section className={styles.content}>
      <div className={styles.sectionHead}><div><p>YOUR DIVE BUDDIES</p><h2>사람으로 보는 로그</h2></div><span>{buddies.length} people</span></div>
      <div className={styles.buddyGrid}>
        <button className={`${styles.buddyCard} ${!selectedBuddy ? styles.selected : ""}`} onClick={() => setSelectedBuddy(null)}><i>⌁</i><b>전체 기록</b><small>{logs.length} dives</small></button>
        {buddies.slice(0, 7).map((buddy) => <button key={buddy.name} className={`${styles.buddyCard} ${selectedBuddy === buddy.name ? styles.selected : ""}`} onClick={() => setSelectedBuddy(selectedBuddy === buddy.name ? null : buddy.name)}><i>{buddy.name.slice(0, 1)}</i><b>{buddy.name}</b><small>{buddy.dives} dives together</small></button>)}
      </div>
    </section>

    <section className={styles.content}>
      <div className={styles.sectionHead}><div><p>ALL DIVE LOGS</p><h2>{selectedBuddy ? `${selectedBuddy}님과 함께한 로그` : "나의 모든 다이빙"}</h2></div><span>{totalDepth ? `TOTAL ${totalDepth.toFixed(1)}m` : ""}</span></div>
      {loading ? <div className={styles.empty}>기록을 불러오는 중입니다.</div> : filteredLogs.length ? <div className={styles.logList}>{filteredLogs.sort((a, b) => b.date.localeCompare(a.date)).map((log, index) => {
        const trip = tripsById.get(log.destinationId);
        return <article className={styles.log} key={log.id}><span className={styles.logNo}>{String(index + 1).padStart(2, "0")}</span><div><p>{trip ? `${trip.country} · ${trip.name}` : "JADAMO OCEAN"} <em>·</em> {log.date}</p><h3>{log.pointName}</h3><small className={styles.recorder}>RECORDED BY {ownerName}</small>{log.note && <small>{log.note}</small>}</div><div className={styles.metrics}><b>{log.maxDepth ? `${log.maxDepth}m` : "—"}</b><span>MAX DEPTH</span></div><div className={styles.metrics}><b>{log.durationMinutes ? `${log.durationMinutes}m` : "—"}</b><span>TIME</span></div><div className={styles.people}>{parseBuddies(log.buddies).length ? parseBuddies(log.buddies).map((buddy) => <span key={buddy}>{buddy.slice(0, 1)}</span>) : <span>엄</span>}<small>{log.buddies || ownerName}</small></div></article>;
      })}</div> : <div className={styles.empty}><b>아직 등록된 다이빙 로그가 없습니다.</b><span>여행 상세 화면에서 첫 다이빙 기록을 추가해 보세요.</span></div>}
    </section>
  </main>;
}
