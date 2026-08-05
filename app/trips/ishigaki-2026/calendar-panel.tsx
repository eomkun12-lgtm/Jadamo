"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type AccessRequest = { id: string; email: string; status: string; createdAt: string };
type CalendarState = {
  isAdmin: boolean;
  configured?: boolean;
  connected?: boolean;
  calendarReady: boolean;
  calendarName: string;
  requests: AccessRequest[];
};

export default function TripCalendarPanel({ tripId }: { tripId: string }) {
  const [state, setState] = useState<CalendarState | null>(null);
  const [email, setEmail] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/calendar/trips/${tripId}`, { cache: "no-store" });
    const data = await response.json() as CalendarState & { error?: string };
    if (!response.ok) throw new Error(data.error || "캘린더 상태를 불러오지 못했습니다.");
    setState(data);
  }, [tripId]);

  // The initial fetch intentionally hydrates this client-only integration state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "캘린더 상태를 불러오지 못했습니다.")); }, [load]);

  async function requestAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/calendar/trips/${tripId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request-access", email }) });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "요청을 보내지 못했습니다.");
      setMessage(data.message || "요청을 보냈습니다."); setEmail(""); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "요청을 보내지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function saveCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/calendar/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", clientId, clientSecret }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Google 연결 정보를 저장하지 못했습니다.");
      setClientSecret(""); setMessage("보안 연결 정보를 저장했습니다. 이제 Google 계정을 연결해 주세요."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Google 연결 정보를 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function adminAction(action: string, requestId?: string) {
    setBusy(true); setMessage("");
    try {
      if (action === "connect") {
        const response = await fetch("/api/calendar/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, destinationId: tripId }) });
        const data = await response.json() as { authorizeUrl?: string; error?: string };
        if (!response.ok || !data.authorizeUrl) throw new Error(data.error || "Google 연결을 시작하지 못했습니다.");
        window.location.assign(data.authorizeUrl); return;
      }
      const response = await fetch(`/api/calendar/trips/${tripId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, requestId }) });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "캘린더 요청을 처리하지 못했습니다.");
      setMessage(data.message || "처리했습니다."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "캘린더 요청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return (
    <section className="trip-calendar-panel" aria-labelledby={`calendar-title-${tripId}`}>
      <div className="trip-calendar-head">
        <div className="trip-calendar-icon" aria-hidden="true">31</div>
        <div><span>ONE-WAY SYNC</span><h3 id={`calendar-title-${tripId}`}>Google Calendar</h3><p>이 여행의 일정만 읽기 전용으로 받아보세요. 사이트에서 바뀐 일정은 자동 반영됩니다.</p></div>
        <span className={`trip-calendar-status ${state?.calendarReady ? "is-ready" : ""}`}>{state?.calendarReady ? "연결됨" : "준비 중"}</span>
      </div>

      {state?.calendarReady ? (
        <form className="trip-calendar-request" onSubmit={requestAccess}>
          <label><span>Google 계정 이메일</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@gmail.com" /></label>
          <button disabled={busy}>{busy ? "요청 중…" : "읽기 전용 추가 요청"}</button>
        </form>
      ) : <p className="trip-calendar-placeholder">관리자가 이 여행의 캘린더를 연결하면 참가자 요청을 받을 수 있어요.</p>}

      {state?.isAdmin && (
        <div className="trip-calendar-admin">
          <div className="trip-calendar-admin-title"><span>OWNER ONLY</span><strong>관리자 연결 및 승인</strong></div>
          {!state.configured ? (
            <form className="trip-calendar-credentials" onSubmit={saveCredentials}>
              <label><span>Google OAuth 클라이언트 ID</span><input required value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="…apps.googleusercontent.com" autoComplete="off" /></label>
              <label><span>클라이언트 보안 비밀</span><input required type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} autoComplete="new-password" /></label>
              <small>입력값은 전송 중 HTTPS로 보호되고, 보안 비밀은 암호화하여 저장합니다.</small>
              <button disabled={busy}>연결 정보 안전하게 저장</button>
            </form>
          ) : !state.connected ? (
            <button className="trip-calendar-primary" disabled={busy} onClick={() => void adminAction("connect")}>Google 계정 연결</button>
          ) : (
            <div className="trip-calendar-admin-actions">
              <button className="trip-calendar-primary" disabled={busy} onClick={() => void adminAction(state.calendarReady ? "sync" : "create-calendar")}>{state.calendarReady ? "전체 일정 다시 동기화" : "이 여행 캘린더 만들기"}</button>
              {state.calendarName && <small>{state.calendarName}</small>}
            </div>
          )}

          {state.requests?.length > 0 && <div className="trip-calendar-requests"><h4>참가자 요청</h4>{state.requests.map((request) => <article key={request.id}><div><strong>{request.email}</strong><span>{request.status === "pending" ? "승인 대기" : request.status === "approved" ? "읽기 전용 승인" : "거절됨"}</span></div>{request.status === "pending" && <div><button disabled={busy} onClick={() => void adminAction("approve", request.id)}>승인</button><button disabled={busy} onClick={() => void adminAction("reject", request.id)}>거절</button></div>}</article>)}</div>}
        </div>
      )}
      {message && <p className="trip-calendar-message" role="status">{message}</p>}
    </section>
  );
}
