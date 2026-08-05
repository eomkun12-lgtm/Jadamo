"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type DiveLog = {
  id: string;
  date: string;
  startTime: string;
  diveNumber: number;
  pointName: string;
  durationMinutes: number | null;
  photoUrls: string[];
};

type Item = { id: string; file: File; capturedAt: Date; source: "EXIF" | "파일 시간"; preview: string; logId: string | null };
const MB = 1024 * 1024;

function read16(view: DataView, offset: number, little: boolean) { return view.getUint16(offset, little); }
function read32(view: DataView, offset: number, little: boolean) { return view.getUint32(offset, little); }

async function exifDate(file: File): Promise<Date | null> {
  if (file.type !== "image/jpeg") return null;
  const bytes = await file.slice(0, 512 * 1024).arrayBuffer();
  const view = new DataView(bytes);
  if (view.byteLength < 12 || view.getUint16(0) !== 0xffd8) return null;
  let pos = 2;
  while (pos + 4 < view.byteLength) {
    if (view.getUint8(pos) !== 0xff) { pos += 1; continue; }
    const marker = view.getUint8(pos + 1); const length = view.getUint16(pos + 2);
    if (marker === 0xe1 && pos + 10 + length <= view.byteLength && String.fromCharCode(...new Uint8Array(bytes.slice(pos + 4, pos + 10))) === "Exif\0\0") {
      const base = pos + 10; const little = view.getUint16(base) === 0x4949;
      if (!little && view.getUint16(base) !== 0x4d4d) return null;
      const ifd = base + read32(view, base + 4, little);
      const count = read16(view, ifd, little);
      let exifIfd = 0;
      for (let i = 0; i < count; i += 1) { const entry = ifd + 2 + i * 12; if (read16(view, entry, little) === 0x8769) exifIfd = base + read32(view, entry + 8, little); }
      if (!exifIfd || exifIfd + 2 > view.byteLength) return null;
      const exifCount = read16(view, exifIfd, little);
      for (let i = 0; i < exifCount; i += 1) {
        const entry = exifIfd + 2 + i * 12; const tag = read16(view, entry, little);
        if (tag !== 0x9003 && tag !== 0x9004) continue;
        const size = read32(view, entry + 4, little); const value = base + read32(view, entry + 8, little);
        if (value + size > view.byteLength) continue;
        const text = String.fromCharCode(...new Uint8Array(bytes.slice(value, value + size))).replace(/\0/g, "");
        const found = text.match(/(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (found) return new Date(Number(found[1]), Number(found[2]) - 1, Number(found[3]), Number(found[4]), Number(found[5]), Number(found[6]));
      }
    }
    if (!length) break; pos += 2 + length;
  }
  return null;
}

function range(log: DiveLog) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(log.date) || !/^\d{2}:\d{2}$/.test(log.startTime)) return null;
  const start = new Date(`${log.date}T${log.startTime}:00`); const end = new Date(start.getTime() + Math.max(10, log.durationMinutes || 50) * 60_000);
  return { start, end };
}
function matchLog(time: Date, logs: DiveLog[]) {
  const margin = 12 * 60_000;
  const candidates = logs.map((log) => ({ log, window: range(log) })).filter((x): x is { log: DiveLog; window: { start: Date; end: Date } } => Boolean(x.window));
  return candidates.find(({ window }) => time >= new Date(window.start.getTime() - margin) && time <= new Date(window.end.getTime() + margin))?.log.id || null;
}
async function resize(file: File) {
  if (file.size <= 1.5 * MB) return file;
  const bitmap = await createImageBitmap(file);
  try { let edge = 1800; let quality = .84; let blob: Blob | null = null;
    for (let i = 0; i < 5; i += 1) { const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale); const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("사진을 준비하지 못했습니다."); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality)); if (blob && blob.size <= 1.5 * MB) break; edge = Math.round(edge * .8); quality -= .08; }
    if (!blob) throw new Error("사진을 준비하지 못했습니다."); return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally { bitmap.close(); }
}

export default function DjiPhotoImporter({ destinationId, logs, onUploaded }: { destinationId: string; logs: DiveLog[]; onUploaded: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false); const [items, setItems] = useState<Item[]>([]); const [status, setStatus] = useState(""); const [uploading, setUploading] = useState(false); const itemsRef = useRef<Item[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.preview)), []);
  const assigned = useMemo(() => items.filter((item) => item.logId), [items]);
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files || []).filter((file) => file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp");
    if (!files.length) return; setStatus("촬영 시간을 읽고 다이브 로그와 연결하고 있습니다.");
    const next = await Promise.all(files.map(async (file, index) => { const date = await exifDate(file); const capturedAt = date || new Date(file.lastModified); return { id: `${file.name}-${file.lastModified}-${index}`, file, capturedAt, source: date ? "EXIF" as const : "파일 시간" as const, preview: URL.createObjectURL(file), logId: matchLog(capturedAt, logs) }; }));
    itemsRef.current.forEach((item) => URL.revokeObjectURL(item.preview)); setItems(next); setStatus(`${next.length}장을 분류했습니다. 연결되지 않은 사진은 업로드 전에 직접 선택할 수 있어요.`); event.currentTarget.value = "";
  }
  function update(id: string, logId: string) { setItems((current) => current.map((item) => item.id === id ? { ...item, logId: logId || null } : item)); }
  async function upload() {
    if (!assigned.length || uploading) return; setUploading(true); setStatus("사진을 올리고 다이브 로그에 연결하고 있습니다.");
    try { const nextUrls = new Map(logs.map((log) => [log.id, [...log.photoUrls]]));
      for (const item of assigned) { const form = new FormData(); form.set("destinationId", destinationId); form.set("category", "ocean"); form.set("caption", `${item.capturedAt.toLocaleString("ko-KR")} 촬영`); form.set("file", await resize(item.file)); const response = await fetch("/api/underwater-photos", { method: "POST", body: form }); const data = await response.json() as { photo?: { imageUrl: string }; error?: string }; if (!response.ok || !data.photo) throw new Error(data.error || "사진 업로드에 실패했습니다."); const urls = nextUrls.get(item.logId!) || []; if (!urls.includes(data.photo.imageUrl)) urls.push(data.photo.imageUrl); nextUrls.set(item.logId!, urls); }
      for (const [id, photoUrls] of nextUrls) { const original = logs.find((log) => log.id === id)?.photoUrls || []; if (photoUrls.length === original.length) continue; const response = await fetch("/api/dive-logs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, destinationId, photoUrls }) }); if (!response.ok) throw new Error("다이브 로그에 사진을 연결하지 못했습니다."); }
      setStatus(`${assigned.length}장의 사진을 각 다이브 로그에 연결했습니다.`); itemsRef.current.forEach((item) => URL.revokeObjectURL(item.preview)); setItems([]); await onUploaded();
    } catch (error) { setStatus(error instanceof Error ? error.message : "사진 업로드에 실패했습니다."); } finally { setUploading(false); }
  }
  return <>
    <button type="button" onClick={() => setOpen(true)}>DJI 사진 자동 분류</button>
    {open && <div role="presentation" onMouseDown={() => !uploading && setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(8, 24, 32, .68)", display: "grid", placeItems: "center", padding: 18 }}>
      <section role="dialog" aria-modal="true" aria-label="DJI 사진 자동 분류" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(920px, 100%)", maxHeight: "86vh", overflow: "auto", background: "#f8f6f0", color: "#163b4a", borderRadius: 18, padding: "24px clamp(16px,4vw,36px)", boxShadow: "0 24px 70px rgba(0,0,0,.3)" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}><div><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", color: "#5f8d97" }}>DJI PHOTO FLOW</span><h3 style={{ margin: "5px 0" }}>촬영 시간으로 다이브 로그에 사진 연결</h3><p style={{ margin: 0, lineHeight: 1.6 }}>DJI JPG의 EXIF 촬영 시간을 우선 사용합니다. 촬영 시간이 없으면 파일 시간을 기준으로 분류해요.</p></div><button type="button" onClick={() => setOpen(false)} disabled={uploading} aria-label="닫기">×</button></header>
        <label style={{ display: "block", margin: "20px 0", padding: 18, border: "1px dashed #7da6ae", borderRadius: 12, textAlign: "center", cursor: "pointer" }}><strong>사진 여러 장 선택</strong><small style={{ display: "block", marginTop: 5 }}>JPG · PNG · WEBP / DJI JPG는 촬영 시간 자동 인식</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void choose(event)} style={{ display: "none" }} /></label>
        {items.map((item) => <article key={item.id} style={{ display: "grid", gridTemplateColumns: "64px 1fr minmax(170px, 240px)", gap: 12, alignItems: "center", padding: "10px 0", borderTop: "1px solid #dce5e3" }}><img src={item.preview} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} /><div><strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.file.name}</strong><small>{item.capturedAt.toLocaleString("ko-KR")} · {item.source}</small></div><select value={item.logId || ""} onChange={(event) => update(item.id, event.currentTarget.value)}><option value="">연결하지 않음</option>{logs.map((log) => <option key={log.id} value={log.id}>#{log.diveNumber} {log.pointName} · {log.date} {log.startTime}</option>)}</select></article>)}
        {status && <p role="status" style={{ margin: "18px 0 0", color: "#376674" }}>{status}</p>}
        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 20 }}><small>{assigned.length}장 연결 예정</small><div style={{ display: "flex", gap: 8 }}><button type="button" onClick={() => setOpen(false)} disabled={uploading}>취소</button><button type="button" onClick={() => void upload()} disabled={!assigned.length || uploading}>{uploading ? "업로드 중…" : `${assigned.length}장 로그에 올리기`}</button></div></footer>
      </section>
    </div>}
  </>;
}
