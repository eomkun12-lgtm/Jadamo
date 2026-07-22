"use client";

import { ChangeEvent, useState } from "react";

type ExistingLog = {
  date: string;
  startTime?: string;
  diveNumber: number;
  maxDepth: number | null;
};
type ImportedDive = {
  key: string;
  selected: boolean;
  isPool: boolean;
  duplicate: boolean;
  date: string;
  startTime: string;
  diveNumber: number;
  pointName: string;
  latitude: number | null;
  longitude: number | null;
  maxDepth: number | null;
  averageDepth: number | null;
  durationMinutes: number | null;
  waterTemperature: number | null;
  profile: { minute: number; depth: number }[];
  tankGas: string;
  tankPressureStart: number | null;
  tankPressureEnd: number | null;
  note: string;
};

function elements(root: Element | Document, names: string[]) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return [...root.getElementsByTagName("*")].filter((node) =>
    wanted.has((node.localName || node.tagName).toLowerCase()),
  );
}
function text(root: Element, names: string[]) {
  for (const name of names) {
    const value = elements(root, [name])
      .map((node) => node.textContent?.trim() || "")
      .find(Boolean);
    if (value) return value;
  }
  return "";
}
function numeric(root: Element, names: string[]) {
  const raw = text(root, names);
  if (!raw) return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}
function round(value: number | null, digits = 1) {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
function pressureBar(value: number | null) {
  if (value === null) return null;
  return round(value > 10000 ? value / 100000 : value, 0);
}

function parseUddf(
  xmlText: string,
  existing: ExistingLog[],
  scheduledDiveDates: Set<string>,
) {
  const document = new DOMParser().parseFromString(xmlText, "application/xml");
  if (document.querySelector("parsererror"))
    throw new Error(
      "UDDF 파일을 읽지 못했습니다. Oceanic+에서 다시 내보내 주세요.",
    );
  const siteMap = new Map<
    string,
    { name: string; latitude: number | null; longitude: number | null }
  >();
  elements(document, ["site", "divesite", "location"]).forEach((site) => {
    const id = site.getAttribute("id") || site.getAttribute("uuid") || "";
    if (!id) return;
    siteMap.set(id, {
      name: text(site, ["name", "sitename", "locationname"]),
      latitude: numeric(site, ["latitude", "lat"]),
      longitude: numeric(site, ["longitude", "lon", "lng"]),
    });
  });
  const dives = elements(document, ["dive"]);
  return dives.map((dive, index) => {
    const dateTime = text(dive, ["datetime", "timestamp", "startdatetime"]);
    const dateOnly = text(dive, ["date"]);
    const timeOnly = text(dive, ["time", "starttime"]);
    const parsedDateTime = dateTime ? new Date(dateTime) : null;
    const validDateTime =
      parsedDateTime && !Number.isNaN(parsedDateTime.getTime());
    const date = /^\d{4}-\d{2}-\d{2}/.test(dateTime)
      ? dateTime.slice(0, 10)
      : /^\d{4}-\d{2}-\d{2}/.test(dateOnly)
        ? dateOnly.slice(0, 10)
        : validDateTime
          ? parsedDateTime!.toISOString().slice(0, 10)
          : "";
    const startTime = /T\d{2}:\d{2}/.test(dateTime)
      ? dateTime.match(/T(\d{2}:\d{2})/)?.[1] || ""
      : /^\d{2}:\d{2}/.test(timeOnly)
        ? timeOnly.slice(0, 5)
        : validDateTime
          ? parsedDateTime!.toTimeString().slice(0, 5)
          : "";
    const ref = elements(dive, ["link", "site", "location"])
      .map(
        (node) => node.getAttribute("ref") || node.getAttribute("idref") || "",
      )
      .find((id) => siteMap.has(id));
    const site = ref ? siteMap.get(ref) : undefined;
    const rawDuration = numeric(dive, ["diveduration", "duration", "divetime"]);
    const rawTemperature = numeric(dive, [
      "lowesttemperature",
      "watertemperature",
      "temperature",
    ]);
    const oxygen = numeric(dive, ["o2", "oxygen"]);
    const pointName =
      text(dive, ["sitename", "locationname", "divesitename"]) ||
      site?.name ||
      `Oceanic+ Dive ${index + 1}`;
    const diveNumber = Math.round(
      numeric(dive, ["divenumber", "number"]) || index + 1,
    );
    const maxDepth = round(
      numeric(dive, ["greatestdepth", "maximumdepth", "maxdepth"]),
    );
    const durationMinutes =
      rawDuration === null
        ? null
        : Math.max(
            1,
            Math.round(rawDuration > 300 ? rawDuration / 60 : rawDuration),
          );
    const waterTemperature =
      rawTemperature === null
        ? null
        : round(
            rawTemperature > 100 ? rawTemperature - 273.15 : rawTemperature,
          );
    const rawProfile = elements(dive, ["waypoint", "sample"]) 
      .map((sample) => ({
        minute: numeric(sample, ["divetime", "elapsedtime", "time"]),
        depth: numeric(sample, ["depth"]),
      }))
      .filter(
        (point): point is { minute: number; depth: number } =>
          point.minute !== null && point.depth !== null,
      );
    const profileTimeIsSeconds =
      rawProfile.length > 1 &&
      rawProfile[rawProfile.length - 1].minute > Math.max(300, (durationMinutes || 0) * 3);
    const profile = rawProfile.map((point) => ({
      minute: round(profileTimeIsSeconds ? point.minute / 60 : point.minute, 2) || 0,
      depth: round(point.depth, 1) || 0,
    }));
    const statedAverageDepth = numeric(dive, ["averagedepth", "meandepth"]);
    const averageDepth = round(
      statedAverageDepth ??
        (profile.length
          ? profile.reduce((sum, point) => sum + point.depth, 0) / profile.length
          : null),
    );
    const tankPressureStart = pressureBar(
      numeric(dive, ["tankpressurebegin", "startpressure", "pressurebegin"]),
    );
    const tankPressureEnd = pressureBar(
      numeric(dive, ["tankpressureend", "endpressure", "pressureend"]),
    );
    const tankGas =
      text(dive, ["gasname", "mixname"]) ||
      (oxygen && oxygen > 0.21
        ? `Nitrox ${Math.round(oxygen <= 1 ? oxygen * 100 : oxygen)}%`
        : "Air");
    const latitude =
      numeric(dive, ["latitude", "lat"]) ?? site?.latitude ?? null;
    const longitude =
      numeric(dive, ["longitude", "lon", "lng"]) ?? site?.longitude ?? null;
    const duplicate = existing.some(
      (log) =>
        log.date === date &&
        ((startTime && log.startTime === startTime) ||
          (!startTime && log.diveNumber === diveNumber)),
    );
    const notes = [
      text(dive, ["notes", "note", "remarks", "comment"]),
      oxygen && oxygen > 0.21
        ? `Nitrox ${Math.round(oxygen <= 1 ? oxygen * 100 : oxygen)}%`
        : "",
      "Oceanic+ UDDF에서 가져옴",
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      key: `${date}-${startTime}-${diveNumber}-${index}`,
      selected: Boolean(date) && scheduledDiveDates.has(date) && !duplicate,
      isPool: false,
      duplicate,
      date,
      startTime,
      diveNumber,
      pointName,
      latitude,
      longitude,
      maxDepth,
      averageDepth,
      durationMinutes,
      waterTemperature,
      profile,
      tankGas,
      tankPressureStart,
      tankPressureEnd,
      note: notes,
    };
  });
}

export default function UddfImporter({
  destinationId,
  existingLogs,
  onImported,
}: {
  destinationId: string;
  existingLogs: ExistingLog[];
  onImported: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [dives, setDives] = useState<ImportedDive[]>([]);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    if (file.size > 5_000_000)
      return setMessage("5MB 이하의 UDDF 파일을 선택해 주세요.");
    try {
      const scheduleResponse = await fetch(
        `/api/trips/${encodeURIComponent(destinationId)}`,
        { cache: "no-store" },
      );
      if (!scheduleResponse.ok)
        throw new Error("여행의 다이빙 일정을 불러오지 못했습니다.");
      const scheduleData = (await scheduleResponse.json()) as {
        items?: {
          category: string;
          date: string;
          title: string;
          note: string;
        }[];
      };
      const scheduledDiveDates = new Set(
        (scheduleData.items || [])
          .filter(
            (item) =>
              ["schedule", "activity"].includes(item.category) &&
              /다이빙|다이브|diving|dive/i.test(`${item.title} ${item.note}`),
          )
          .map((item) => item.date)
          .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)),
      );
      const parsed = parseUddf(
        await file.text(),
        existingLogs,
        scheduledDiveDates,
      );
      if (!parsed.length)
        throw new Error("파일에서 다이빙 기록을 찾지 못했습니다.");
      setFileName(file.name);
      setDives(parsed);
      setMessage(
        scheduledDiveDates.size
          ? `다이빙 일정 ${scheduledDiveDates.size}일과 겹치는 기록만 자동 선택했습니다.`
          : "여행 일정에서 다이빙 날짜를 찾지 못해 자동 선택하지 않았습니다.",
      );
    } catch (error) {
      setDives([]);
      setMessage(
        error instanceof Error ? error.message : "파일을 읽지 못했습니다.",
      );
    }
  }
  async function importSelected() {
    const selected = dives.filter((dive) => dive.selected);
    if (!selected.length) return setMessage("가져올 다이빙을 선택해 주세요.");
    setSaving(true);
    setMessage("");
    let completed = 0;
    try {
      for (const dive of selected) {
        const response = await fetch("/api/dive-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...dive,
            destinationId,
            visibility: null,
            entryType: dive.isPool ? "pool" : "boat",
            currentStrength: "calm",
            buddies: "",
            creatures: "",
            photoUrls: [],
          }),
        });
        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          throw new Error(data.error || "일부 기록을 저장하지 못했습니다.");
        }
        completed += 1;
      }
      await onImported();
      setMessage(`${completed}개의 다이빙을 가져왔습니다.`);
      setDives([]);
    } catch (error) {
      setMessage(
        `${completed}개 저장 후 중단됨 · ${error instanceof Error ? error.message : "오류가 발생했습니다."}`,
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <button type="button" className="uddf-open" onClick={() => setOpen(true)}>
        ⇧ Oceanic+ 가져오기
      </button>
      {open && (
        <div
          className="uddf-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="uddf-title"
        >
          <button
            className="dive-log-scrim"
            onClick={() => setOpen(false)}
            aria-label="닫기"
          />
          <div className="uddf-panel">
            <header>
              <div>
                <span>OCEANIC+ · UDDF</span>
                <h3 id="uddf-title">다이빙 기록 가져오기</h3>
              </div>
              <button onClick={() => setOpen(false)}>×</button>
            </header>
            <label className="uddf-file">
              <input
                type="file"
                accept=".uddf,.xml,application/xml,text/xml"
                onChange={selectFile}
              />
              <strong>{fileName || "UDDF 파일 선택"}</strong>
              <span>Oceanic+ 로그북에서 내보낸 파일 · 최대 5MB</span>
            </label>
            {dives.length > 0 && (
              <>
                <div className="uddf-summary">
                  <div>
                    <strong>{dives.length}개 발견</strong>
                    <div className="uddf-select-actions">
                      <button
                        type="button"
                        onClick={() => setDives((current) => current.map((item) => ({ ...item, selected: Boolean(item.date) && !item.duplicate })))}
                      >
                        전체 선택
                      </button>
                      <button
                        type="button"
                        onClick={() => setDives((current) => current.map((item) => ({ ...item, selected: false })))}
                      >
                        전체 해제
                      </button>
                    </div>
                  </div>
                  <span>
                    중복 {dives.filter((dive) => dive.duplicate).length}개 ·
                    선택 {dives.filter((dive) => dive.selected).length}개
                  </span>
                </div>
                <div className="uddf-list">
                  {dives.map((dive) => (
                    <div
                      className={dive.duplicate ? "is-duplicate uddf-row" : "uddf-row"}
                      key={dive.key}
                    >
                      <input
                        type="checkbox"
                        aria-label={`${dive.pointName} 가져오기`}
                        checked={dive.selected}
                        onChange={(event) =>
                          setDives((current) =>
                            current.map((item) =>
                              item.key === dive.key
                                ? { ...item, selected: event.target.checked }
                                : item,
                            ),
                          )
                        }
                      />
                      <div>
                        <strong>
                          {dive.date || "날짜 없음"} {dive.startTime} · DIVE{" "}
                          {dive.diveNumber}
                        </strong>
                        <span>{dive.pointName}</span>
                        <small>
                          {dive.maxDepth ?? "—"}m ·{" "}
                          {dive.durationMinutes ?? "—"}분 ·{" "}
                          {dive.waterTemperature ?? "—"}℃
                        </small>
                      </div>
                      <div className="uddf-row-actions">
                        {dive.maxDepth !== null && dive.maxDepth <= 6 && !dive.duplicate && (
                          <label className="uddf-pool-check">
                            <input
                              type="checkbox"
                              checked={dive.isPool}
                              onChange={(event) =>
                                setDives((current) =>
                                  current.map((item) =>
                                    item.key === dive.key
                                      ? { ...item, isPool: event.target.checked }
                                      : item,
                                  ),
                                )
                              }
                            />
                            <span>수영장</span>
                          </label>
                        )}
                        {dive.duplicate && <b>중복</b>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {message && <p className="uddf-message">{message}</p>}
            <button
              className="uddf-import"
              disabled={saving || !dives.some((dive) => dive.selected)}
              onClick={() => void importSelected()}
            >
              {saving ? "가져오는 중…" : "선택한 기록 가져오기"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
