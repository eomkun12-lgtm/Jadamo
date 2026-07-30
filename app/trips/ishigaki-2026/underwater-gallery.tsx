"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type UnderwaterPhoto = {
  id: string;
  category: "creature" | "ocean";
  caption: string;
  originalName: string;
  imageUrl: string;
  originalImageUrl: string;
  isAiEnhanced: boolean;
  enhancementStatus: "pending" | "processing" | "complete" | "failed";
  isRepresentative: boolean;
  createdAt: string;
};

type PhotoCategory = "creature" | "ocean";
type SelectedPhoto = { name: string; size: number; sourceUrl: string; correctedUrl: string | null };

const sections = [
  {
    id: "creature" as const,
    eyebrow: "MARINE LIFE",
    title: "생물 사진",
    description: "바다에서 만난 생물의 모습을 모아두는 관찰 갤러리입니다.",
  },
  {
    id: "ocean" as const,
    eyebrow: "UNDERWATER SCENE",
    title: "바다 사진",
    description: "수중 풍경과 버디, 다이빙의 순간을 자유롭게 기록합니다.",
  },
];

const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const SAFE_UPLOAD_BYTES = Math.floor(1.5 * 1024 * 1024);

async function responseData(response: Response, fallback: string) {
  const body = await response.text();
  if (!body) return { error: fallback };
  try {
    return JSON.parse(body) as { error?: string };
  } catch {
    if (response.status === 413 || /payload too large/i.test(body)) {
      return { error: "사진 용량이 너무 큽니다. 더 작은 사진을 선택해 주세요." };
    }
    return { error: fallback };
  }
}

async function optimizePhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    let maxEdge = 1800;
    let quality = 0.84;
    let result: Blob | null = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("사진을 변환하지 못했습니다.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (result && result.size <= SAFE_UPLOAD_BYTES) break;
      maxEdge = Math.round(maxEdge * 0.82);
      quality = Math.max(0.58, quality - 0.08);
    }

    if (!result || result.size > SAFE_UPLOAD_BYTES) throw new Error("사진 용량을 줄이지 못했습니다. 더 작은 사진을 선택해 주세요.");
    const baseName = file.name.replace(/\.[^.]+$/, "") || "underwater-photo";
    return new File([result], `${baseName}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

async function applyTone(file: File, strength = 60) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("사진을 보정하지 못했습니다.");

    const amount = strength / 100;
    context.filter = `brightness(${1 + amount * .09}) contrast(${1 + amount * .22}) saturate(${1 + amount * .2}) hue-rotate(${-amount * 6}deg)`;
    context.drawImage(bitmap, 0, 0);
    context.filter = "none";

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const red = pixels.data[index];
      const green = pixels.data[index + 1];
      const blue = pixels.data[index + 2];
      pixels.data[index] = Math.min(255, red * (1 + amount * .2) + amount * 8);
      pixels.data[index + 1] = Math.min(255, green * (1 + amount * .06) + amount * 3);
      pixels.data[index + 2] = Math.max(0, blue * (1 - amount * .13) - amount * 3);
    }
    context.putImageData(pixels, 0, 0);

    let quality = 0.86;
    let result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    while (result && result.size > SAFE_UPLOAD_BYTES && quality > 0.58) {
      quality -= 0.07;
      result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    }
    if (!result || result.size > SAFE_UPLOAD_BYTES) throw new Error("사진 용량을 안전하게 줄이지 못했습니다. 더 작은 사진을 선택해 주세요.");
    const baseName = file.name.replace(/\.[^.]+$/, "") || "underwater-photo";
    return new File([result], `${baseName}-oceanwick.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

export default function UnderwaterGallery({ destinationId, destinationName }: { destinationId: string; destinationName: string }) {
  const [photos, setPhotos] = useState<UnderwaterPhoto[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [savingCategory, setSavingCategory] = useState<PhotoCategory | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<Record<PhotoCategory, SelectedPhoto | null>>({ creature: null, ocean: null });
  const [comparisonPosition, setComparisonPosition] = useState<Record<PhotoCategory, number>>({ creature: 54, ocean: 54 });
  const [toneStrength, setToneStrength] = useState(60);
  const [uploadStatus, setUploadStatus] = useState<Record<PhotoCategory, string>>({ creature: "", ocean: "" });
  const [previewPhoto, setPreviewPhoto] = useState<UnderwaterPhoto | null>(null);
  const preparedFiles = useRef<Record<PhotoCategory, File | null>>({ creature: null, ocean: null });
  const sourceFiles = useRef<Record<PhotoCategory, File | null>>({ creature: null, ocean: null });
  const preparationVersion = useRef<Record<PhotoCategory, number>>({ creature: 0, ocean: 0 });
  const comparisonPositionRef = useRef<Record<PhotoCategory, number>>({ creature: 54, ocean: 54 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/underwater-photos?destinationId=${encodeURIComponent(destinationId)}`, { cache: "no-store" });
      const data = await responseData(response, "수중 기록을 불러오지 못했습니다.") as { photos?: UnderwaterPhoto[]; isAdmin?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "수중 기록을 불러오지 못했습니다.");
      setPhotos(data.photos || []);
      setIsAdmin(Boolean(data.isAdmin));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수중 기록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [destinationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!previewPhoto) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewPhoto(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [previewPhoto]);

  async function preparePhoto(file: File, category: PhotoCategory) {
    const version = preparationVersion.current[category] + 1;
    preparationVersion.current[category] = version;
    const previous = selectedPhotos[category];
    if (previous) {
      URL.revokeObjectURL(previous.sourceUrl);
      if (previous.correctedUrl) URL.revokeObjectURL(previous.correctedUrl);
    }
    const sourceUrl = URL.createObjectURL(file);
    sourceFiles.current[category] = file;
    preparedFiles.current[category] = null;
    setSelectedPhotos((current) => ({ ...current, [category]: { name: file.name, size: file.size, sourceUrl, correctedUrl: null } }));
    setUploadStatus((current) => ({ ...current, [category]: "원본과 보정본을 준비하고 있습니다." }));
    try {
      const optimized = await optimizePhoto(file);
      const corrected = await applyTone(optimized, toneStrength);
      const correctedUrl = URL.createObjectURL(corrected);
      if (preparationVersion.current[category] !== version) {
        URL.revokeObjectURL(correctedUrl);
        return;
      }
      preparedFiles.current[category] = corrected;
      setSelectedPhotos((current) => {
        const currentPhoto = current[category];
        if (!currentPhoto || currentPhoto.sourceUrl !== sourceUrl) {
          URL.revokeObjectURL(correctedUrl);
          return current;
        }
        return { ...current, [category]: { ...currentPhoto, correctedUrl } };
      });
      setUploadStatus((current) => ({ ...current, [category]: "슬라이더를 움직여 전후 색감을 비교해 보세요." }));
    } catch (error) {
      setUploadStatus((current) => ({ ...current, [category]: error instanceof Error ? error.message : "사진 미리보기를 만들지 못했습니다." }));
    }
  }

  useEffect(() => {
    (Object.entries(sourceFiles.current) as Array<[PhotoCategory, File | null]>).forEach(([category, file]) => {
      if (file) void preparePhoto(file, category);
    });
  }, [toneStrength]);

  function updateComparison(stage: HTMLElement, category: PhotoCategory, position: number) {
    const clamped = Math.max(0, Math.min(100, position));
    comparisonPositionRef.current[category] = clamped;
    stage.style.setProperty("--comparison-position", `${clamped}%`);
  }

  function commitComparison(category: PhotoCategory) {
    setComparisonPosition((current) => ({ ...current, [category]: comparisonPositionRef.current[category] }));
  }

  async function upload(event: FormEvent<HTMLFormElement>, category: PhotoCategory) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) {
      setUploadStatus((current) => ({ ...current, [category]: "먼저 사진을 선택해 주세요." }));
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setUploadStatus((current) => ({ ...current, [category]: "원본 사진은 30MB 이하여야 합니다." }));
      return;
    }
    formData.append("destinationId", destinationId);
    formData.append("category", category);
    setSaving(true);
    setSavingCategory(category);
    setMessage("");
    try {
      setUploadStatus((current) => ({
        ...current,
        [category]: file.size > SAFE_UPLOAD_BYTES ? "큰 사진을 자동으로 최적화하는 중…" : "사진을 업로드하는 중…",
      }));
      // The preview is disposable: regenerate at submission time so the stored
      // file always matches the currently selected tone.
      const source = sourceFiles.current[category] || file;
      const corrected = await applyTone(await optimizePhoto(source), toneStrength);
      formData.set("file", corrected, corrected.name);
      setUploadStatus((current) => ({ ...current, [category]: "보정본을 업로드하고 있습니다." }));
      const response = await fetch("/api/underwater-photos", { method: "POST", body: formData });
      const data = await responseData(response, "사진을 업로드하지 못했습니다.");
      if (!response.ok) throw new Error(data.error || "사진을 업로드하지 못했습니다.");
      const uploadedPhoto = (data as { photo?: UnderwaterPhoto }).photo;
      if (uploadedPhoto) {
        setPhotos((current) => [...current, uploadedPhoto]);
      }
      form.reset();
      preparedFiles.current[category] = null;
      setSelectedPhotos((current) => ({ ...current, [category]: null }));
      setUploadStatus((current) => ({ ...current, [category]: "✓ 톤 보정 완료 — 아래 갤러리에 보정본이 추가되었습니다." }));
      setMessage(category === "creature" ? "생물 사진을 추가했습니다." : "바다 사진을 추가했습니다.");
      await load();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "사진을 업로드하지 못했습니다.";
      setUploadStatus((current) => ({ ...current, [category]: `업로드 실패 — ${errorMessage}` }));
      setMessage(errorMessage);
    } finally {
      setSaving(false);
      setSavingCategory(null);
    }
  }

  async function remove(photo: UnderwaterPhoto) {
    if (!window.confirm("이 사진을 삭제할까요?")) return;
    setSaving(true);
    try {
      const response = await fetch("/api/underwater-photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: photo.id }),
      });
      const data = await responseData(response, "사진을 삭제하지 못했습니다.");
      if (!response.ok) throw new Error(data.error || "사진을 삭제하지 못했습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "사진을 삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function selectRepresentative(photo: UnderwaterPhoto) {
    setSaving(true);
    try {
      const response = await fetch("/api/underwater-photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: photo.id }),
      });
      const data = await responseData(response, "대표 사진을 저장하지 못했습니다.");
      if (!response.ok) throw new Error(data.error || "대표 사진을 저장하지 못했습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "대표 사진을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="underwater-records">
      <header className="underwater-records-head">
        <span className="eyebrow">UNDERWATER ARCHIVE</span>
        <h2>{destinationName} 수중 기록</h2>
        <p>오셔닉 로그와 포인트 기록 없이, 바다에서 직접 찍은 사진을 주제별로 간직합니다.</p>
      </header>

      {message && <p className="underwater-message" role="status">{message}</p>}

      {sections.map((section) => {
        const gallery = photos.filter((photo) => photo.category === section.id);
        return (
          <section className="underwater-section" key={section.id}>
            <div className="underwater-section-head">
              <div>
                <span className="eyebrow">{section.eyebrow}</span>
                <h3>{section.title}</h3>
                <p>{section.description}</p>
              </div>
              <strong className="underwater-section-count">{gallery.length} PHOTOS</strong>
            </div>

            <form className="underwater-upload" onSubmit={(event) => void upload(event, section.id)}>
              <label className="underwater-file">
                <span>{section.title} 선택 · JPG / PNG / WEBP · 기기에서 톤 보정 후 업로드</span>
                <input
                  name="file"
                  type="file"
                  required
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void preparePhoto(file, section.id);
                    else setSelectedPhotos((current) => ({ ...current, [section.id]: null }));
                  }}
                />
              </label>
              <label>
                <span>사진 설명</span>
                <input
                  name="caption"
                  type="text"
                  maxLength={120}
                  placeholder={section.id === "creature" ? "예: 첫 만남, 푸른바다거북" : "예: 오전 다이빙의 맑은 시야"}
                />
              </label>
              <label className="appendix-honeypot" aria-hidden="true">
                <span>Website</span><input name="website" tabIndex={-1} autoComplete="off" />
              </label>
              <button disabled={saving || !selectedPhotos[section.id]?.correctedUrl}>
                {savingCategory === section.id ? "톤 보정 중…" : "무료 보정 후 올리기"}
              </button>
              <label className="underwater-tone-control">
                <span>톤 강도 <strong>{toneStrength}%</strong></span>
                <input type="range" min="0" max="100" value={toneStrength} onChange={(event) => setToneStrength(Number(event.currentTarget.value))} />
                <small>낮게는 자연스럽게, 높게는 따뜻한 색과 대비를 더 강하게 복원합니다.</small>
              </label>
              {selectedPhotos[section.id] && (
                <section className="underwater-before-after" aria-label="원본과 보정본 비교">
                  <header><span>원본</span><strong>전후 비교</strong><span>톤 보정본</span></header>
                  <div
                    className="underwater-before-after-stage"
                    style={{ "--comparison-position": `${comparisonPosition[section.id]}%` } as React.CSSProperties}
                  >
                    {selectedPhotos[section.id]?.correctedUrl ? (
                      <img src={selectedPhotos[section.id]!.correctedUrl!} alt="톤 보정 미리보기" />
                    ) : <div className="underwater-before-after-loading">보정 미리보기 준비 중…</div>}
                    <div className="underwater-before-after-original">
                      <img src={selectedPhotos[section.id]!.sourceUrl} alt="원본 미리보기" />
                    </div>
                    <span className="underwater-before-after-handle" aria-hidden="true" />
                    <input
                      className="underwater-before-after-range"
                      aria-label="보정 전후 비교 위치"
                      type="range"
                      min="0"
                      max="100"
                      defaultValue={comparisonPosition[section.id]}
                      onInput={(event) => updateComparison(event.currentTarget.parentElement!, section.id, Number(event.currentTarget.value))}
                      onPointerUp={() => commitComparison(section.id)}
                      onPointerCancel={() => commitComparison(section.id)}
                      onKeyUp={() => commitComparison(section.id)}
                    />
                  </div>
                  <p>슬라이더를 드래그해 원본과 보정본을 비교한 뒤 업로드하세요.</p>
                </section>
              )}
              <p
                className={`underwater-selection-status${selectedPhotos[section.id] ? " is-selected" : ""}${uploadStatus[section.id].startsWith("✓") ? " is-complete" : ""}`}
                role="status"
                aria-live="polite"
              >
                {selectedPhotos[section.id] && (
                  <strong>{selectedPhotos[section.id]?.name} · {(selectedPhotos[section.id]!.size / 1024 / 1024).toFixed(1)}MB</strong>
                )}
                <span>{uploadStatus[section.id] || "사진을 선택하면 파일명과 업로드 상태가 여기에 표시됩니다."}</span>
              </p>
            </form>

            <div className="underwater-grid">
              {gallery.map((photo) => (
                <article key={photo.id}>
                  <button
                    className="underwater-preview-trigger"
                    type="button"
                    onClick={() => setPreviewPhoto(photo)}
                    aria-label={`${photo.caption || section.title} 크게 보기`}
                  >
                    <img src={photo.imageUrl} alt={photo.caption || section.title} loading="lazy" />
                  </button>
                  <figcaption>{photo.caption || photo.originalName}</figcaption>
                  {photo.enhancementStatus === "complete" && <span className="underwater-ai-badge">톤 보정</span>}
                  {photo.isRepresentative && <span className="underwater-representative-badge">대표 사진</span>}
                  {isAdmin && (
                    <>
                      <button className="underwater-representative" type="button" disabled={saving || photo.enhancementStatus !== "complete"} onClick={() => void selectRepresentative(photo)}>대표 사진</button>
                      <button className="underwater-delete" type="button" disabled={saving} onClick={() => void remove(photo)} aria-label="사진 삭제">×</button>
                    </>
                  )}
                </article>
              ))}
              {!loading && gallery.length === 0 && (
                <p className="underwater-empty">아직 사진이 없습니다. 첫 {section.title}을 올려보세요.</p>
              )}
              {loading && <p className="underwater-empty">사진을 불러오는 중…</p>}
            </div>
          </section>
        );
      })}

      {previewPhoto && (
        <div className="underwater-lightbox" role="presentation" onMouseDown={() => setPreviewPhoto(null)}>
          <section
            className="underwater-lightbox-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="수중 사진 크게 보기"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="underwater-lightbox-close" type="button" onClick={() => setPreviewPhoto(null)} aria-label="팝업 닫기">×</button>
            {previewPhoto.enhancementStatus === "complete" && previewPhoto.isAiEnhanced ? (
              <div className="underwater-compare">
                <figure><img src={previewPhoto.originalImageUrl} alt={`${previewPhoto.caption || previewPhoto.originalName} 원본`} /><figcaption>원본</figcaption></figure>
                <figure><img src={previewPhoto.imageUrl} alt={`${previewPhoto.caption || previewPhoto.originalName} AI 보정본`} /><figcaption>AI 보정본</figcaption></figure>
              </div>
            ) : (
              <img src={previewPhoto.imageUrl} alt={previewPhoto.caption || previewPhoto.originalName} />
            )}
            <div className="underwater-lightbox-caption">
              <strong>{previewPhoto.caption || previewPhoto.originalName}</strong>
              <span>{new Date(previewPhoto.createdAt).toLocaleDateString("ko-KR")}</span>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
