"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

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
type SelectedPhoto = { name: string; size: number };

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
const SAFE_UPLOAD_BYTES = 4 * 1024 * 1024;

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
  if (file.size <= SAFE_UPLOAD_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  try {
    let maxEdge = 2400;
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

export default function UnderwaterGallery({ destinationId, destinationName }: { destinationId: string; destinationName: string }) {
  const [photos, setPhotos] = useState<UnderwaterPhoto[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [savingCategory, setSavingCategory] = useState<PhotoCategory | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<Record<PhotoCategory, SelectedPhoto | null>>({ creature: null, ocean: null });
  const [uploadStatus, setUploadStatus] = useState<Record<PhotoCategory, string>>({ creature: "", ocean: "" });
  const [previewPhoto, setPreviewPhoto] = useState<UnderwaterPhoto | null>(null);

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
      const optimized = await optimizePhoto(file);
      formData.set("file", optimized, optimized.name);
      setUploadStatus((current) => ({ ...current, [category]: "사진을 저장하는 중…" }));
      const response = await fetch("/api/underwater-photos", { method: "POST", body: formData });
      const data = await responseData(response, "사진을 업로드하지 못했습니다.");
      if (!response.ok) throw new Error(data.error || "사진을 업로드하지 못했습니다.");
      const uploadedPhoto = (data as { photo?: UnderwaterPhoto }).photo;
      if (uploadedPhoto) {
        setPhotos((current) => [...current, { ...uploadedPhoto, enhancementStatus: "processing" }]);
        setUploadStatus((current) => ({ ...current, [category]: "보정 중 — 원본은 저장되었고 AI가 사진을 보정하고 있습니다." }));
        const enhanceResponse = await fetch(`/api/underwater-photos/${encodeURIComponent(uploadedPhoto.id)}/enhance`, { method: "POST" });
        const enhanceData = await responseData(enhanceResponse, "AI 사진 보정에 실패했습니다.");
        if (!enhanceResponse.ok) throw new Error(enhanceData.error || "AI 사진 보정에 실패했습니다.");
      }
      form.reset();
      setSelectedPhotos((current) => ({ ...current, [category]: null }));
      setUploadStatus((current) => ({ ...current, [category]: "✓ 업로드 완료 — 아래 갤러리에 사진이 추가되었습니다." }));
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
                <span>{section.title} 선택 · JPG / PNG / WEBP · 큰 사진은 자동 최적화</span>
                <input
                  name="file"
                  type="file"
                  required
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    setSelectedPhotos((current) => ({
                      ...current,
                      [section.id]: file ? { name: file.name, size: file.size } : null,
                    }));
                    setUploadStatus((current) => ({
                      ...current,
                      [section.id]: file ? "선택 완료 · 아직 업로드 전입니다. ‘사진 올리기’를 눌러주세요." : "",
                    }));
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
              <button disabled={saving || !selectedPhotos[section.id]}>
                {savingCategory === section.id ? "업로드 중…" : "사진 올리기"}
              </button>
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
                  {photo.enhancementStatus === "processing" && <span className="underwater-ai-badge">보정 중</span>}
                  {photo.enhancementStatus === "complete" && <span className="underwater-ai-badge">AI 보정</span>}
                  {photo.enhancementStatus === "failed" && <span className="underwater-ai-badge">보정 실패</span>}
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
            {previewPhoto.enhancementStatus === "complete" ? (
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
