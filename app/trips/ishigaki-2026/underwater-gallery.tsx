"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type UnderwaterPhoto = {
  id: string;
  category: "creature" | "ocean";
  caption: string;
  originalName: string;
  imageUrl: string;
  createdAt: string;
};

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

export default function UnderwaterGallery({ destinationId, destinationName }: { destinationId: string; destinationName: string }) {
  const [photos, setPhotos] = useState<UnderwaterPhoto[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/underwater-photos?destinationId=${encodeURIComponent(destinationId)}`, { cache: "no-store" });
      const data = (await response.json()) as { photos?: UnderwaterPhoto[]; isAdmin?: boolean; error?: string };
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

  async function upload(event: FormEvent<HTMLFormElement>, category: "creature" | "ocean") {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) return setMessage("업로드할 사진을 선택해 주세요.");
    if (file.size > 15 * 1024 * 1024) return setMessage("사진은 15MB 이하여야 합니다.");
    formData.append("destinationId", destinationId);
    formData.append("category", category);
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/underwater-photos", { method: "POST", body: formData });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "사진을 업로드하지 못했습니다.");
      form.reset();
      setMessage(category === "creature" ? "생물 사진을 추가했습니다." : "바다 사진을 추가했습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "사진을 업로드하지 못했습니다.");
    } finally {
      setSaving(false);
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
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "사진을 삭제하지 못했습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "사진을 삭제하지 못했습니다.");
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
                <span>{section.title} 선택 · JPG / PNG / WEBP · 최대 15MB</span>
                <input name="file" type="file" required accept="image/jpeg,image/png,image/webp" />
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
              <button disabled={saving}>{saving ? "업로드 중…" : "사진 올리기"}</button>
            </form>

            <div className="underwater-grid">
              {gallery.map((photo) => (
                <article key={photo.id}>
                  <a href={photo.imageUrl} target="_blank" rel="noreferrer">
                    <img src={photo.imageUrl} alt={photo.caption || section.title} loading="lazy" />
                  </a>
                  <figcaption>{photo.caption || photo.originalName}</figcaption>
                  {isAdmin && (
                    <button className="underwater-delete" type="button" disabled={saving} onClick={() => void remove(photo)} aria-label="사진 삭제">×</button>
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
    </section>
  );
}
