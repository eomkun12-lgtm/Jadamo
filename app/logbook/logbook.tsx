"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./logbook.module.css";
import mapStyles from "./map.module.css";
import stampStyles from "./stamp-book.module.css";

type Destination = { id: string; name: string; country: string; countryCode?: string; month: string; year: string; latitude: number; longitude: number };
type DiveLog = { id: string; destinationId: string; date: string; pointName: string; maxDepth: number | null; durationMinutes: number | null; buddies: string; creatures: string; note: string };
type Participant = { name: string; gender: "male" | "female" | "unspecified"; trips: { id: string }[] };
type ShopStamp = { id: string; destinationId: string; shopName: string; visitedAt: string; imageUrl: string };

const ownerName = "엄경훈";
const coreDestination: Destination = { id: "ishigaki-2026", name: "Ishigaki", country: "Japan", countryCode: "JP", month: "OCT", year: "2026", latitude: 24.34, longitude: 124.15 };
const parseBuddies = (value: string) => value.split(/[,/·\n]+/).map((name) => name.trim()).filter(Boolean);
const collapsedExceptLatest = (items: DiveLog[]) => {
  const destinationIds = [...new Set([...items].sort((a, b) => b.date.localeCompare(a.date)).map((log) => log.destinationId))];
  return new Set(destinationIds.slice(1));
};
const participantColor = (gender?: Participant["gender"]) => gender === "female" ? "#d98aa7" : gender === "male" ? "#5e9fd0" : "#79969f";
const countryFlag = (code?: string, country?: string) => {
  const byName: Record<string, string> = { Japan: "JP", 일본: "JP", Philippines: "PH", 필리핀: "PH", Korea: "KR", 대한민국: "KR", Indonesia: "ID", 인도네시아: "ID", Thailand: "TH", 태국: "TH" };
  const resolved = code || byName[country || ""];
  return resolved && /^[a-z]{2}$/i.test(resolved) ? String.fromCodePoint(...resolved.toUpperCase().split("").map((letter) => 127397 + letter.charCodeAt(0))) : "🌍";
};

export default function Logbook() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [logs, setLogs] = useState<DiveLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBuddy, setSelectedBuddy] = useState<string | null>(null);
  const [collapsedDestinationIds, setCollapsedDestinationIds] = useState<Set<string>>(() => new Set());
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [stamps, setStamps] = useState<ShopStamp[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stampMessage, setStampMessage] = useState("");
  const [savingStamp, setSavingStamp] = useState(false);
  const mapRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (mapRef.current?.contentDocument?.readyState === "complete") setMapReady(true);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/destinations", { cache: "no-store" });
        const data = (await response.json()) as { destinations?: Destination[] };
        const trips = [coreDestination, ...(data.destinations || []).filter((trip) => trip.id !== coreDestination.id)];
        const [results, participantsResponse, stampsResponse] = await Promise.all([Promise.all(trips.map(async (trip) => {
          const logsResponse = await fetch(`/api/dive-logs?destinationId=${encodeURIComponent(trip.id)}`, { cache: "no-store" });
          const logsData = (await logsResponse.json()) as { logs?: DiveLog[] };
          return logsData.logs || [];
        })), fetch("/api/participants", { cache: "no-store" }), fetch("/api/dive-shop-stamps", { cache: "no-store" })]);
        const participantData = (await participantsResponse.json()) as { participants?: Participant[] };
        const stampData = (await stampsResponse.json()) as { stamps?: ShopStamp[]; isAdmin?: boolean };
        if (active) {
          const allLogs = results.flat();
          setDestinations(trips);
          setLogs(allLogs);
          setCollapsedDestinationIds(collapsedExceptLatest(allLogs));
          setParticipants(participantData.participants || []);
          setStamps(stampData.stamps || []);
          setIsAdmin(Boolean(stampData.isAdmin));
        }
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
  const logsByDestination = useMemo(() => {
    const groups = new Map<string, DiveLog[]>();
    [...filteredLogs].sort((a, b) => b.date.localeCompare(a.date)).forEach((log) => {
      const group = groups.get(log.destinationId) || [];
      group.push(log);
      groups.set(log.destinationId, group);
    });
    return [...groups.entries()]
      .map(([destinationId, destinationLogs]) => ({ destinationId, destination: tripsById.get(destinationId), logs: destinationLogs }))
      .sort((a, b) => b.logs[0].date.localeCompare(a.logs[0].date));
  }, [filteredLogs, tripsById]);
  const totalMinutes = logs.reduce((sum, log) => sum + (log.durationMinutes || 0), 0);
  const totalDepth = logs.reduce((sum, log) => sum + (log.maxDepth || 0), 0);

  function toggleDestination(destinationId: string) {
    setCollapsedDestinationIds((current) => {
      const next = new Set(current);
      if (next.has(destinationId)) next.delete(destinationId);
      else next.add(destinationId);
      return next;
    });
  }

  function filterByBuddy(name: string | null) {
    const nextLogs = name ? logs.filter((log) => parseBuddies(log.buddies).includes(name)) : logs;
    setSelectedBuddy(name);
    setCollapsedDestinationIds(collapsedExceptLatest(nextLogs));
  }

  async function saveStamp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingStamp(true);
    setStampMessage("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/dive-shop-stamps", { method: "POST", body: new FormData(form) });
      const data = await response.json() as { stamp?: ShopStamp; error?: string };
      if (!response.ok || !data.stamp) throw new Error(data.error || "스탬프를 저장하지 못했습니다.");
      setStamps((current) => [data.stamp!, ...current]);
      form.reset();
      setStampMessage("다이브 숍 도장을 모았습니다.");
    } catch (error) {
      setStampMessage(error instanceof Error ? error.message : "스탬프를 저장하지 못했습니다.");
    } finally { setSavingStamp(false); }
  }

  async function removeStamp(stamp: ShopStamp) {
    if (!window.confirm(`“${stamp.shopName}” 도장을 삭제할까요?`)) return;
    const response = await fetch("/api/dive-shop-stamps", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: stamp.id }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) return setStampMessage(data.error || "스탬프를 삭제하지 못했습니다.");
    setStamps((current) => current.filter((item) => item.id !== stamp.id));
  }

  return <main className={`${styles.page} journal-page`}>
    <header className={styles.nav}>
      <Link href="/" className={styles.brand}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/jadamo-logo.png" alt="Jadamo" /> <span>JADAMO OCEAN</span></Link>
      <div className={styles.owner}><span className={styles.avatar}>엄</span><span><b>{ownerName}</b><small>DIVE LOG OWNER</small></span></div>
      <Link href="/" className={styles.back}>여행 지도 ←</Link>
    </header>

    <section className={styles.hero}>
      <p>PERSONAL DIVE ARCHIVE · RECORDED BY {ownerName.toUpperCase()}</p><h1>{ownerName}의<br />다이빙 로그북</h1>
      <span><b>기록자 {ownerName}</b> · 장소와 사람으로 이어지는 나만의 바다 기록</span>
    </section>

    <section className={styles.stats} aria-label="다이빙 요약">
      <div><b>{logs.length}</b><span>기록한 다이빙</span></div>
      <div><b>{myDestinationCount}</b><span>참가한 여행지</span></div>
      <div><b>{buddies.length}</b><span>함께한 버디</span></div>
      <div><b>{totalMinutes ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` : "—"}</b><span>누적 잠수 시간</span></div>
    </section>

    <section className={mapStyles.dashboard}>
      <aside className={mapStyles.sideMenu}><p>LOGBOOK MENU</p><a className={mapStyles.active} href="#my-map">⌖ 내가 잠수한 곳</a><a href="#shop-stamps">◉ 숍 스탬프북</a><a href="#all-logs">▧ 나의 모든 다이빙</a><a href="#buddies">◎ 다이브 버디</a><div><span>RECORD OWNER</span><b>엄경훈</b></div></aside>
      <article className={mapStyles.mapCard} id="my-map"><header><div><p>MY DIVE MAP</p><h2>내가 잠수한 곳</h2></div><span>{myDestinationCount} PLACES</span></header><div className={mapStyles.mapFrame}><iframe ref={mapRef} title="엄경훈의 다이빙 방문 지도" src="/map.html" onLoad={() => setMapReady(true)} /></div><footer><span><i></i> 엄경훈 참가 여행지</span><b>다이브 로그와 연결된 장소</b></footer></article>
    </section>

    <section className={styles.content} id="shop-stamps">
      <div className={styles.sectionHead}><div><p>DIVE SHOP STAMP BOOK</p><h2>다이브 숍 스탬프북</h2><small>다이빙 여행에서 받은 숍 도장을 여행별로 모아둡니다.</small></div><span>{stamps.length} STAMPS</span></div>
      {isAdmin && <form className={stampStyles.form} onSubmit={saveStamp}>
        <label><span>여행</span><select name="destinationId" required defaultValue=""><option value="" disabled>여행 선택</option>{destinations.map((destination) => <option value={destination.id} key={destination.id}>{destination.name} · {destination.year}</option>)}</select></label>
        <label><span>다이브 숍</span><input name="shopName" required maxLength={80} placeholder="예: Marinchu Ishigaki" /></label>
        <label><span>방문일</span><input name="visitedAt" type="date" required /></label>
        <label><span>도장 사진</span><input name="file" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
        <button disabled={savingStamp}>{savingStamp ? "저장 중…" : "도장 추가"}</button>
      </form>}
      {stampMessage && <p className={stampStyles.message} role="status">{stampMessage}</p>}
      {stamps.length ? <div className={stampStyles.grid}>{stamps.map((stamp) => {
        const destination = tripsById.get(stamp.destinationId);
        return <article className={stampStyles.card} key={stamp.id}>
          <img src={stamp.imageUrl} alt={`${stamp.shopName} 다이브 숍 도장`} loading="lazy" />
          <div><span>{destination ? `${countryFlag(destination.countryCode, destination.country)} ${destination.name}` : "DIVE TRIP"}</span><h3>{stamp.shopName}</h3><small>{stamp.visitedAt}</small></div>
          {isAdmin && <button type="button" onClick={() => void removeStamp(stamp)}>삭제</button>}
        </article>;
      })}</div> : <div className={styles.empty}><b>아직 모은 숍 도장이 없습니다.</b><span>다이빙 숍에서 받은 첫 도장을 사진으로 남겨 보세요.</span></div>}
    </section>

    <section className={styles.content} id="buddies">
      <div className={styles.sectionHead}><div><p>YOUR DIVE BUDDIES</p><h2>사람으로 보는 로그</h2><small>다이빙 로그의 ‘동행 버디’에 직접 입력된 사람만 표시합니다.</small></div><span>{buddies.length} people</span></div>
      <div className={styles.buddyGrid}>
        <button type="button" aria-pressed={!selectedBuddy} className={`${styles.buddyCard} ${!selectedBuddy ? styles.selected : ""}`} onClick={() => filterByBuddy(null)}><i>⌁</i><b>전체 기록</b><small>{logs.length} dives</small></button>
        {buddies.slice(0, 7).map((buddy) => <button type="button" aria-pressed={selectedBuddy === buddy.name} key={buddy.name} className={`${styles.buddyCard} ${selectedBuddy === buddy.name ? styles.selected : ""}`} onClick={() => filterByBuddy(selectedBuddy === buddy.name ? null : buddy.name)}><i style={{ background: participantColor(buddy.gender), color: "#fff" }}>{buddy.name.slice(0, 1)}</i><b>{buddy.name}</b><small>{buddy.dives}회 · 로그 동행 버디</small></button>)}
      </div>
    </section>

    <section className={styles.content} id="all-logs">
      <div className={styles.sectionHead}><div><p>ALL DIVE LOGS</p><h2>{selectedBuddy ? `${selectedBuddy}님과 함께한 로그` : "나의 모든 다이빙"}</h2></div><span>{totalDepth ? `TOTAL ${totalDepth.toFixed(1)}m` : ""}</span></div>
      {loading ? <div className={styles.empty}>기록을 불러오는 중입니다.</div> : filteredLogs.length ? <div style={{ display: "grid", gap: 34 }}>{logsByDestination.map(({ destinationId, destination, logs: destinationLogs }) => <section style={{ display: "grid", gap: 10 }} key={destinationId}>
        <header style={{ borderBottom: "1px solid #bdd3cc" }}>
          <button type="button" onClick={() => toggleDestination(destinationId)} aria-expanded={!collapsedDestinationIds.has(destinationId)} style={{ width: "100%", display: "flex", alignItems: "end", justifyContent: "space-between", padding: "0 3px 11px", border: 0, color: "inherit", background: "transparent", cursor: "pointer", textAlign: "left" }}>
            <div><p style={{ margin: "0 0 3px", color: "#8ccac1", fontSize: 9, fontWeight: 800, letterSpacing: ".09em" }}>{destination ? `${countryFlag(destination.countryCode, destination.country)} ${destination.country}` : "JADAMO OCEAN"}</p><h3 style={{ margin: 0, color: "#eef3e9", fontSize: 20, letterSpacing: "-.05em" }}>{destination?.name || "기록된 여행"}</h3></div>
            <span style={{ color: "#168a85", fontSize: 10, fontWeight: 800, letterSpacing: ".1em" }}>{collapsedDestinationIds.has(destinationId) ? "▸ 펼치기" : "▾ 접기"} · {destinationLogs.length} DIVES</span>
          </button>
        </header>
        {!collapsedDestinationIds.has(destinationId) && <div className={styles.logList}>{destinationLogs.map((log, index) => {
        const trip = destination || tripsById.get(log.destinationId);
        const logBuddies = parseBuddies(log.buddies);
        const [year, month, day] = log.date.split("-");
        return <article className={styles.log} key={log.id}>
          <div className={styles.date}><strong>{month}.{day}</strong><span>{year}</span><small>#{String(index + 1).padStart(2, "0")}</small></div>
          <div className={styles.logMain}><p style={{ color: "#24535a", fontWeight: 800 }}>{trip ? `${countryFlag(trip.countryCode, trip.country)} ${trip.country} · ${trip.name}` : "JADAMO OCEAN"}</p><h3>{log.pointName}</h3><span>RECORDED BY {ownerName}</span>{log.note && <small>{log.note}</small>}</div>
          <div className={styles.metric}><span>MAX DEPTH</span><b>{log.maxDepth ? `${log.maxDepth}m` : "—"}</b></div>
          <div className={styles.metric}><span>DIVE TIME</span><b>{log.durationMinutes ? `${log.durationMinutes}m` : "—"}</b></div>
          <div className={styles.buddyLine}><span>WITH</span><div>{logBuddies.length ? logBuddies.map((buddy) => <i key={buddy} style={{ background: participantColor(participantByName.get(buddy.toLocaleLowerCase("ko"))?.gender) }}>{buddy.slice(0, 1)}</i>) : <i>엄</i>}<b>{logBuddies.length ? log.buddies : "엄경훈 단독"}</b></div></div>
        </article>;
      })}</div>}</section>)}</div> : <div className={styles.empty}><b>아직 등록된 다이빙 로그가 없습니다.</b><span>여행 상세 화면에서 첫 다이빙 기록을 추가해 보세요.</span></div>}
    </section>
  </main>;
}
