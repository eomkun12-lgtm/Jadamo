"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import UddfImporter from "./uddf-importer";

type DiveLog = {
  id: string;
  destinationId: string;
  date: string;
  startTime: string;
  diveNumber: number;
  pointName: string;
  latitude: number | null;
  longitude: number | null;
  maxDepth: number | null;
  durationMinutes: number | null;
  waterTemperature: number | null;
  visibility: number | null;
  entryType: string;
  currentStrength: string;
  buddies: string;
  creatures: string;
  note: string;
  photoUrls: string[];
  sortOrder: number;
};
type FormData = Omit<
  DiveLog,
  "id" | "destinationId" | "sortOrder" | "photoUrls"
> & { photoUrlsText: string };
const empty: FormData = {
  date: "",
  startTime: "",
  diveNumber: 1,
  pointName: "",
  latitude: null,
  longitude: null,
  maxDepth: null,
  durationMinutes: null,
  waterTemperature: null,
  visibility: null,
  entryType: "boat",
  currentStrength: "calm",
  buddies: "",
  creatures: "",
  note: "",
  photoUrlsText: "",
};
const entryLabel: Record<string, string> = {
  boat: "보트",
  beach: "비치",
  drift: "드리프트",
};
const currentLabel: Record<string, string> = {
  calm: "약함",
  medium: "보통",
  strong: "강함",
};
const n = (value: string) => (value === "" ? null : Number(value));
export default function DiveLogManager({
  destinationId,
}: {
  destinationId: string;
}) {
  const [logs, setLogs] = useState<DiveLog[]>([]),
    [isAdmin, setIsAdmin] = useState(false),
    [open, setOpen] = useState(false),
    [editingId, setEditingId] = useState<string | null>(null),
    [form, setForm] = useState<FormData>(empty),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const mapRef = useRef<HTMLIFrameElement>(null);
  const load = useCallback(async () => {
    const r = await fetch(
      `/api/dive-logs?destinationId=${encodeURIComponent(destinationId)}`,
      { cache: "no-store" },
    );
    const d = (await r.json()) as {
      logs?: DiveLog[];
      isAdmin?: boolean;
      error?: string;
    };
    if (r.ok) {
      setLogs(d.logs || []);
      setIsAdmin(Boolean(d.isAdmin));
    } else setMessage(d.error || "로그를 불러오지 못했습니다.");
  }, [destinationId]);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    mapRef.current?.contentWindow?.postMessage(
      {
        type: "dive-points",
        points: logs.map(({ pointName, date, latitude, longitude }) => ({
          pointName,
          date,
          latitude,
          longitude,
        })),
      },
      window.location.origin,
    );
  }, [logs]);
  function edit(log: DiveLog) {
    setEditingId(log.id);
    setForm({ ...log, photoUrlsText: log.photoUrls.join("\n") });
    setOpen(true);
    setMessage("");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const r = await fetch("/api/dive-logs", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          id: editingId,
          destinationId,
          photoUrls: form.photoUrlsText
            .split(/\n|,/)
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error || "저장하지 못했습니다.");
      setOpen(false);
      setEditingId(null);
      setForm(empty);
      await load();
    } catch (x) {
      setMessage(x instanceof Error ? x.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: string) {
    if (!confirm("이 다이브 로그를 삭제할까요?")) return;
    setSaving(true);
    await fetch("/api/dive-logs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, destinationId }),
    });
    setSaving(false);
    await load();
  }
  async function drop(targetId: string) {
    if (!dragId || dragId === targetId) return setDragId(null);
    const next = [...logs],
      from = next.findIndex((x) => x.id === dragId),
      to = next.findIndex((x) => x.id === targetId);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setLogs(next);
    setDragId(null);
    await fetch("/api/dive-logs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationId, logIds: next.map((x) => x.id) }),
    });
  }
  return (
    <section className="dive-log-section" id="dive-log">
      <div className="dive-log-head">
        <div>
          <span>DIVE LOG & POINT MAP</span>
          <h3>바다에서 만난 포인트.</h3>
          <p>
            실제 입수 순서와 수중 환경, 관찰 생물을 여행의 기록으로 남깁니다.
          </p>
        </div>
        {isAdmin && (
          <div className="dive-log-head-actions">
            <UddfImporter
              destinationId={destinationId}
              existingLogs={logs}
              onImported={load}
            />
            <button
              onClick={() => {
                setEditingId(null);
                setForm(empty);
                setOpen(true);
              }}
            >
              ＋ 포인트 기록
            </button>
          </div>
        )}
      </div>
      <div className="dive-log-layout">
        <div className="dive-point-map">
          <iframe
            ref={mapRef}
            src="/dive-map.html"
            title="다이빙 포인트 지도"
            onLoad={() =>
              mapRef.current?.contentWindow?.postMessage(
                { type: "dive-points", points: logs },
                window.location.origin,
              )
            }
          />
          <span>좌표가 입력된 포인트가 지도에 표시됩니다.</span>
        </div>
        <div className="dive-log-list">
          {logs.length ? (
            logs.map((log, index) => (
              <article
                key={log.id}
                className="dive-log-card"
                draggable={isAdmin && !saving}
                onDragStart={() => setDragId(log.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => void drop(log.id)}
              >
                <div className="dive-log-number">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <b>DIVE {String(log.diveNumber).padStart(2, "0")}</b>
                </div>
                <div className="dive-log-copy">
                  <span>
                    {log.date}{log.startTime ? ` · ${log.startTime}` : ""} · {entryLabel[log.entryType] || log.entryType}
                  </span>
                  <h4>{log.pointName}</h4>
                  <div className="dive-log-metrics">
                    <b>
                      {log.maxDepth ?? "—"}
                      <small>m depth</small>
                    </b>
                    <b>
                      {log.durationMinutes ?? "—"}
                      <small>min</small>
                    </b>
                    <b>
                      {log.waterTemperature ?? "—"}
                      <small>℃ water</small>
                    </b>
                    <b>
                      {log.visibility ?? "—"}
                      <small>m visibility</small>
                    </b>
                  </div>
                  {log.creatures && (
                    <p>
                      <strong>SEEN</strong> {log.creatures}
                    </p>
                  )}
                  {(log.buddies || log.note) && (
                    <p>
                      {[log.buddies && `버디 ${log.buddies}`, log.note]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  <small>
                    조류{" "}
                    {currentLabel[log.currentStrength] || log.currentStrength}
                  </small>
                  {log.photoUrls.length > 0 && (
                    <div className="dive-log-photos">
                      {log.photoUrls.map((url) => (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          key={url}
                        >
                          <img src={url} alt={`${log.pointName} 다이빙 기록`} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                {isAdmin && (
                  <div className="dive-log-actions">
                    <span title="끌어서 순서 변경">⠿</span>
                    <button onClick={() => edit(log)}>수정</button>
                    <button onClick={() => void remove(log.id)}>삭제</button>
                  </div>
                )}
              </article>
            ))
          ) : (
            <div className="dive-log-empty">
              아직 기록된 다이빙 포인트가 없습니다.
              {isAdmin && (
                <button onClick={() => setOpen(true)}>
                  첫 포인트 기록하기
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {message && <p className="dive-log-message">{message}</p>}
      {open && isAdmin && (
        <div className="dive-log-modal">
          <button
            className="dive-log-scrim"
            onClick={() => setOpen(false)}
            aria-label="닫기"
          />
          <form onSubmit={save}>
            <header>
              <div>
                <span>DIVE POINT</span>
                <h3>{editingId ? "포인트 기록 수정" : "새 포인트 기록"}</h3>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>
            <div className="dive-log-form-row">
              <label>
                <span>날짜 *</span>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </label>
              <label>
                <span>시작 시간</span>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                />
              </label>
              <label>
                <span>다이브 순번</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={form.diveNumber}
                  onChange={(e) =>
                    setForm({ ...form, diveNumber: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <label>
              <span>포인트 이름 *</span>
              <input
                required
                value={form.pointName}
                onChange={(e) =>
                  setForm({ ...form, pointName: e.target.value })
                }
              />
            </label>
            <div className="dive-log-form-row">
              <label>
                <span>위도</span>
                <input
                  type="number"
                  step="any"
                  value={form.latitude ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, latitude: n(e.target.value) })
                  }
                />
              </label>
              <label>
                <span>경도</span>
                <input
                  type="number"
                  step="any"
                  value={form.longitude ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, longitude: n(e.target.value) })
                  }
                />
              </label>
            </div>
            <div className="dive-log-form-grid">
              <label>
                <span>최대 수심(m)</span>
                <input
                  type="number"
                  step=".1"
                  value={form.maxDepth ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, maxDepth: n(e.target.value) })
                  }
                />
              </label>
              <label>
                <span>다이빙 시간(분)</span>
                <input
                  type="number"
                  value={form.durationMinutes ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, durationMinutes: n(e.target.value) })
                  }
                />
              </label>
              <label>
                <span>수온(℃)</span>
                <input
                  type="number"
                  step=".1"
                  value={form.waterTemperature ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, waterTemperature: n(e.target.value) })
                  }
                />
              </label>
              <label>
                <span>시야(m)</span>
                <input
                  type="number"
                  step=".1"
                  value={form.visibility ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, visibility: n(e.target.value) })
                  }
                />
              </label>
            </div>
            <div className="dive-log-form-row">
              <label>
                <span>입수 방식</span>
                <select
                  value={form.entryType}
                  onChange={(e) =>
                    setForm({ ...form, entryType: e.target.value })
                  }
                >
                  <option value="boat">보트</option>
                  <option value="beach">비치</option>
                  <option value="drift">드리프트</option>
                </select>
              </label>
              <label>
                <span>조류</span>
                <select
                  value={form.currentStrength}
                  onChange={(e) =>
                    setForm({ ...form, currentStrength: e.target.value })
                  }
                >
                  <option value="calm">약함</option>
                  <option value="medium">보통</option>
                  <option value="strong">강함</option>
                </select>
              </label>
            </div>
            <label>
              <span>버디·참가자</span>
              <input
                value={form.buddies}
                onChange={(e) => setForm({ ...form, buddies: e.target.value })}
              />
            </label>
            <label>
              <span>관찰 생물</span>
              <input
                value={form.creatures}
                onChange={(e) =>
                  setForm({ ...form, creatures: e.target.value })
                }
                placeholder="만타 3마리, 바다거북"
              />
            </label>
            <label>
              <span>메모</span>
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </label>
            <label>
              <span>사진 주소 (한 줄에 하나)</span>
              <textarea
                value={form.photoUrlsText}
                onChange={(e) =>
                  setForm({ ...form, photoUrlsText: e.target.value })
                }
                placeholder="https://..."
              />
            </label>
            {message && <p>{message}</p>}
            <button className="dive-log-save" disabled={saving}>
              {saving ? "저장 중…" : editingId ? "수정 저장" : "포인트 저장"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
