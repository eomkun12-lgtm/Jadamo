"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type Notice = { id: string; destinationId: string | null; title: string; content: string; startAt: string; endAt: string; isPopup: number; isImportant: number; };
type Destination = { id: string; name: string; year: string; month: string };
type NoticeForm = { destinationId: string; title: string; content: string; startAt: string; endAt: string; isPopup: boolean; isImportant: boolean };
const emptyForm: NoticeForm = { destinationId: "", title: "", content: "", startAt: "", endAt: "", isPopup: true, isImportant: false };

function localInput(value: string) { return value ? value.slice(0, 16) : ""; }
function iso(value: string) { return value ? new Date(value).toISOString() : ""; }

export default function NoticeCenter() {
  const pathname = usePathname();
  const destinationId = pathname.match(/^\/trips\/([^/]+)/)?.[1] || "";
  const [notices, setNotices] = useState<Notice[]>([]);
  const [adminNotices, setAdminNotices] = useState<Notice[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NoticeForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [dismissed, setDismissed] = useState<string[]>([]);

  const load = useCallback(async () => {
    const response = await fetch(`/api/notices?destinationId=${encodeURIComponent(destinationId)}`, { cache: "no-store" });
    const data = (await response.json()) as { notices?: Notice[]; adminNotices?: Notice[]; isAdmin?: boolean };
    if (!response.ok) return;
    setNotices(data.notices || []); setAdminNotices(data.adminNotices || []); setIsAdmin(Boolean(data.isAdmin));
  }, [destinationId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { if (!managerOpen || destinations.length) return; fetch("/api/destinations", { cache: "no-store" }).then((response) => response.json()).then((data: { destinations?: Destination[] }) => setDestinations(data.destinations || [])).catch(() => undefined); }, [managerOpen, destinations.length]);

  const popup = useMemo(() => notices.find((notice) => notice.isPopup && !dismissed.includes(notice.id) && (typeof window === "undefined" || window.localStorage.getItem(`notice-hide-${notice.id}`) !== new Date().toISOString().slice(0, 10))), [dismissed, notices]);
  function closePopup(today = false) { if (!popup) return; if (today) window.localStorage.setItem(`notice-hide-${popup.id}`, new Date().toISOString().slice(0, 10)); setDismissed((current) => [...current, popup.id]); }
  function openManager() { if (!isAdmin) { window.location.href = `/signin-with-chatgpt?return_to=${encodeURIComponent(pathname)}`; return; } setManagerOpen(true); }
  function edit(notice: Notice) { setEditingId(notice.id); setForm({ destinationId: notice.destinationId || "", title: notice.title, content: notice.content, startAt: localInput(notice.startAt), endAt: localInput(notice.endAt), isPopup: Boolean(notice.isPopup), isImportant: Boolean(notice.isImportant) }); setMessage(""); }
  function reset() { setEditingId(null); setForm(emptyForm); setMessage(""); }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/notices", { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, id: editingId, destinationId: form.destinationId || null, startAt: iso(form.startAt), endAt: iso(form.endAt) }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "저장하지 못했습니다.");
      reset(); setMessage("공지가 저장되었습니다."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); } finally { setSaving(false); }
  }
  async function remove(id: string) {
    if (!window.confirm("이 공지를 삭제할까요?")) return;
    setSaving(true); const response = await fetch("/api/notices", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setSaving(false); if (response.ok) { reset(); await load(); } else setMessage("삭제하지 못했습니다.");
  }

  return <>
    <button className="notice-admin-button" type="button" onClick={openManager}>{isAdmin ? "공지 관리" : "관리자"}</button>
    {popup && <div className="notice-popup" role="dialog" aria-modal="true" aria-labelledby="notice-popup-title"><button className="notice-popup-scrim" onClick={() => closePopup()} aria-label="공지 닫기" /><article className={popup.isImportant ? "is-important" : ""}><div className="notice-popup-label">{popup.isImportant ? "IMPORTANT NOTICE" : "JADAMO NOTICE"}</div><button className="notice-popup-close" onClick={() => closePopup()} aria-label="닫기">×</button><h2 id="notice-popup-title">{popup.title}</h2><p>{popup.content}</p><div className="notice-popup-actions"><button onClick={() => closePopup(true)}>오늘은 다시 보지 않기</button><button onClick={() => closePopup()}>확인</button></div></article></div>}
    {managerOpen && isAdmin && <div className="notice-manager" role="dialog" aria-modal="true" aria-labelledby="notice-manager-title"><button className="notice-popup-scrim" onClick={() => setManagerOpen(false)} aria-label="공지 관리 닫기" /><div className="notice-manager-panel"><header><div><span>OWNER ONLY</span><h2 id="notice-manager-title">공지 관리</h2></div><button onClick={() => setManagerOpen(false)} aria-label="닫기">×</button></header><div className="notice-manager-grid"><form onSubmit={save}><label><span>공지 범위</span><select value={form.destinationId} onChange={(event) => setForm({ ...form, destinationId: event.target.value })}><option value="">전체 여행</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.year} {item.month} · {item.name}</option>)}</select></label><label><span>제목</span><input required maxLength={80} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label><span>내용</span><textarea required maxLength={1200} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /></label><div className="notice-manager-dates"><label><span>게시 시작</span><input type="datetime-local" value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} /></label><label><span>게시 종료</span><input type="datetime-local" value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} /></label></div><div className="notice-manager-checks"><label><input type="checkbox" checked={form.isPopup} onChange={(event) => setForm({ ...form, isPopup: event.target.checked })} /> 팝업으로 표시</label><label><input type="checkbox" checked={form.isImportant} onChange={(event) => setForm({ ...form, isImportant: event.target.checked })} /> 중요 공지</label></div>{message && <p className="notice-manager-message">{message}</p>}<div className="notice-manager-actions"><button disabled={saving}>{saving ? "저장 중…" : editingId ? "수정 저장" : "공지 등록"}</button>{editingId && <button type="button" onClick={reset}>취소</button>}</div></form><section><h3>등록된 공지</h3><div className="notice-manager-list">{adminNotices.length ? adminNotices.map((notice) => <article key={notice.id}><span>{notice.destinationId ? destinations.find((item) => item.id === notice.destinationId)?.name || "여행별" : "전체"}{notice.isImportant ? " · 중요" : ""}</span><strong>{notice.title}</strong><p>{notice.content}</p><div><button onClick={() => edit(notice)}>수정</button><button disabled={saving} onClick={() => void remove(notice.id)}>삭제</button></div></article>) : <p>등록된 공지가 없습니다.</p>}</div></section></div></div></div>}
  </>;
}
