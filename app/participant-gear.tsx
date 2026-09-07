"use client";

import { useEffect, useState } from "react";
import { gearSlots, type ParticipantGear } from "../lib/participant-gear";
import styles from "./participant-gear.module.css";

export default function GearProfile({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const [failedImages, setFailedImages] = useState<Record<string, string>>({});
  const [gear, setGear] = useState<ParticipantGear>({});
  const [slot, setSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/participants/gear?name=${encodeURIComponent(name)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then((data) => { setGear(data.gear); setLoading(false); setError(""); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason.message || "불러오지 못했습니다."); });
    return () => controller.abort();
  }, [name, attempt]);

  return <section aria-label={`${name}의 장비 현황`}>
    <div className={styles.body}>
      <div className={styles.summary}><span>나의 장비 컬렉션</span><b>{Object.keys(gear).length} / 9</b></div>
      <p className={styles.hint}>{isAdmin ? "장비 칸을 눌러 모델과 사진을 등록하세요." : "참석자의 보유 장비입니다. 장비 등록·수정은 관리자가 할 수 있습니다."}</p>
      {error && <p role="alert" className={styles.error}>{error} {loading && <button type="button" onClick={() => setAttempt(attempt + 1)}>다시 시도</button>}</p>}
      {loading ? <p role="status">장비 정보를 불러오는 중입니다.</p> : <>
        <div className={styles.figure}>
          <svg className={styles.diver} viewBox="0 0 240 460" fill="none" aria-hidden="true">
            <circle cx="120" cy="57" r="33"/><path d="M91 92 Q120 79 149 92 L166 213 L149 272 L145 386 L120 386 L113 278 L104 386 L80 386 L83 271 L73 215Z"/><path d="M89 99 Q66 95 57 130 L36 224 L54 230 L82 158 M151 99 Q174 95 183 130 L204 224 L186 230 L158 158 M80 386 L66 435 Q82 447 104 434 L104 386 M120 386 L121 434 Q151 447 166 435 L145 386"/><rect x="91" y="44" width="58" height="25" rx="10"/><path d="M120 69V85 Q170 112 164 166 M88 109 L107 164 H135 L153 109 M85 225 H154"/>
          </svg>
          {gearSlots.map((label, index) => <button key={label} type="button" className={`${styles.slot} ${gear[label] ? styles.owned : ""}`} style={{ gridColumn: index === 8 ? "2" : index % 2 === 0 ? "1" : "3", gridRow: Math.floor(index / 2) + 1 }} aria-label={`${label}: ${gear[label]?.model || "미등록"}`} aria-pressed={slot === label} onClick={() => { setSlot(label); setNotice(""); }}>
            <span className={styles.thumbnail}>{gear[label]?.image && failedImages[label] !== gear[label].image ? <img src={gear[label].image} alt="" referrerPolicy="no-referrer" onError={() => setFailedImages((previous) => ({ ...previous, [label]: gear[label].image }))} /> : <span className={styles.imageStatus}>{gear[label]?.image ? "사진 오류" : gear[label] ? "사진 없음" : "미등록"}</span>}</span><b>{label}</b><small>{gear[label]?.model || "미등록"}</small>
          </button>)}
        </div>
        {slot && <section className={styles.editor} key={slot} aria-label={`${slot} 상세`}><h3>{slot}</h3>{gear[slot]?.image && failedImages[slot] === gear[slot].image && <p className={styles.error}>사진을 불러올 수 없습니다. 사진 파일의 HTTPS 주소를 확인해 주세요.</p>}{isAdmin ? <form onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const next = { ...gear };
          const model = String(data.get("model") || "").trim();
          if (model) next[slot] = { model, image: String(data.get("image") || "").trim() }; else delete next[slot];
          setSaving(true); setError(""); setNotice("");
          try {
            const response = await fetch("/api/participants/gear", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, gear: next }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            setGear(result.gear); setNotice("저장했습니다.");
          } catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); }
          finally { setSaving(false); }
        }}><fieldset disabled={saving}><label>브랜드 · 모델명<input name="model" maxLength={100} defaultValue={gear[slot]?.model || ""} placeholder="예: SCUBAPRO MK25 EVO" /></label><label>장비 사진 주소<input name="image" type="url" pattern="https://.*" maxLength={2000} defaultValue={gear[slot]?.image || ""} placeholder="https://…" /></label><small>사진 파일 주소를 입력하세요. 퐁당 이미지 확대 페이지 주소도 지원합니다. 사진 없이 모델명만 등록할 수도 있습니다. 모델명을 비우고 저장하면 장비가 삭제됩니다.</small><button type="submit">{saving ? "저장 중…" : "장비 저장"}</button></fieldset></form> : <p>{gear[slot]?.model || "아직 등록된 장비가 없습니다."}</p>}</section>}
      </>}
      <p role="status" className={styles.hint}>{notice}</p>
    </div>
  </section>;
}
