"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type AppendixFile = {
  id: string;
  destinationId: string;
  title: string;
  description: string;
  contributor: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  fileUrl: string;
};

type AppendixPreview = {
  title: string;
  description: string;
  meta: string;
  fileUrl: string;
  contentType: string;
};

// The hosting upload gateway rejects multipart bodies around 3 MB before the
// route runs. Keep a small margin for form fields and transparently optimise
// photographs that exceed this transport limit.
const MAX_UPLOAD_BYTES = 2_700_000;

async function optimiseImageForUpload(file: File) {
  if (!file.type.startsWith("image/") || file.size <= MAX_UPLOAD_BYTES)
    return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("이미지 파일을 읽지 못했습니다."));
      image.src = objectUrl;
    });
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight, 1);
    const scale = Math.min(1, 2400 / longestSide);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let best: Blob | null = null;
    for (const quality of [0.84, 0.74, 0.64]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (!blob) continue;
      best = blob;
      if (blob.size <= MAX_UPLOAD_BYTES) break;
    }
    if (!best) return file;
    const name = file.name.replace(/\.[^.]+$/, "") || "appendix-image";
    return new File([best], `${name}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function sizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function AppendixManager({
  destinationId,
  destinationName,
  showIshigakiGuide = false,
}: {
  destinationId: string;
  destinationName: string;
  showIshigakiGuide?: boolean;
}) {
  const [files, setFiles] = useState<AppendixFile[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<AppendixPreview | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/appendix?destinationId=${encodeURIComponent(destinationId)}`, { cache: "no-store" });
      const data = (await response.json()) as { files?: AppendixFile[]; isAdmin?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "참고 자료를 불러오지 못했습니다.");
      setFiles(data.files || []);
      setIsAdmin(Boolean(data.isAdmin));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "참고 자료를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [destinationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!preview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [preview]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const selectedFile = formData.get("file");
    if (!(selectedFile instanceof File) || !selectedFile.size) return setMessage("업로드할 파일을 선택해 주세요.");
    formData.append("destinationId", destinationId);
    setSaving(true);
    setMessage("");
    try {
      const file = await optimiseImageForUpload(selectedFile);
      formData.set("file", file);
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error("PDF는 2.5MB 이하, 이미지는 자동 최적화 후 2.5MB 이하로 업로드할 수 있습니다.");
      }
      const response = await fetch("/api/appendix", { method: "POST", body: formData });
      const isJson = response.headers.get("content-type")?.includes("application/json");
      const data = (isJson ? await response.json() : {}) as { error?: string };
      if (!response.ok) {
        throw new Error(response.status === 413 ? "파일이 업로드 한도를 초과했습니다. 이미지는 자동 최적화되며, PDF는 2.5MB 이하로 올려 주세요." : data.error || "자료를 업로드하지 못했습니다.");
      }
      formRef.current?.reset();
      setMessage("참고 자료가 추가되었습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "자료를 업로드하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(file: AppendixFile) {
    if (!window.confirm(`“${file.title}” 자료를 삭제할까요?`)) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/appendix", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: file.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "자료를 삭제하지 못했습니다.");
      setMessage("참고 자료가 삭제되었습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "자료를 삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="appendix-manager">
      <header className="appendix-manager-head">
        <div><span>OPEN APPENDIX</span><h2>{destinationName} 참고 자료</h2><p>일행 누구나 여행에 필요한 이미지와 PDF를 함께 추가할 수 있습니다.</p></div>
        <strong>{files.length + (showIshigakiGuide ? 1 : 0)} FILES</strong>
      </header>

      <form className="appendix-upload" ref={formRef} onSubmit={upload}>
        <div className="appendix-upload-title"><span>＋</span><div><strong>참고 자료 추가</strong><small>JPG · PNG · WEBP · PDF / 이미지 자동 최적화 · PDF 최대 2.5MB</small></div></div>
        <label><span>자료 제목 *</span><input name="title" required maxLength={80} placeholder="예: 다이브 숍 가격표" /></label>
        <label><span>설명</span><input name="description" maxLength={300} placeholder="자료를 간단히 설명해 주세요." /></label>
        <label><span>올린 사람</span><input name="contributor" maxLength={30} placeholder="이름 또는 별명 (선택)" /></label>
        <label className="appendix-file-field"><span>파일 *</span><input name="file" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" /></label>
        <label className="appendix-honeypot" aria-hidden="true"><span>Website</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
        <button type="submit" disabled={saving}>{saving ? "업로드 중…" : "자료 업로드"}</button>
        <p>개인정보, 예약번호, 여권 정보가 포함된 파일은 올리지 마세요. 부적절한 자료는 관리자가 삭제할 수 있습니다.</p>
      </form>

      {message && <p className="appendix-message" role="status">{message}</p>}

      <div className="appendix-library">
        {showIshigakiGuide && (
          <article className="appendix-file-card is-image is-built-in">
            <button
              className="appendix-preview-trigger"
              type="button"
              onClick={() => setPreview({
                title: "마린츄 이시가키 참고 안내",
                description: "다이빙·스노클링·크루즈 프로그램과 가격 및 연락처",
                meta: "기본 제공 자료",
                fileUrl: "/marinchu-ishigaki-appendix.jpeg",
                contentType: "image/jpeg",
              })}
              aria-label="마린츄 이시가키 참고 안내 크게 보기"
            >
              <Image src="/marinchu-ishigaki-appendix.jpeg" width={1072} height={1527} sizes="(max-width: 720px) 100vw, 420px" alt="마린츄 이시가키 프로그램과 가격 안내" />
            </button>
            <div><span>APPENDIX · ORIGINAL</span><h3>마린츄 이시가키 참고 안내</h3><p>다이빙·스노클링·크루즈 프로그램과 가격 및 연락처</p><small>기본 제공 자료</small></div>
          </article>
        )}
        {files.map((file) => (
          <article className={`appendix-file-card ${file.contentType.startsWith("image/") ? "is-image" : "is-pdf"}`} key={file.id}>
            <button
              className="appendix-preview-trigger"
              type="button"
              onClick={() => setPreview({
                title: file.title,
                description: file.description,
                meta: `${file.contributor ? `${file.contributor} · ` : ""}${sizeLabel(file.sizeBytes)}`,
                fileUrl: file.fileUrl,
                contentType: file.contentType,
              })}
              aria-label={`${file.title} 팝업으로 보기`}
            >
              {file.contentType.startsWith("image/") ? <img src={file.fileUrl} alt={file.title} loading="lazy" /> : <span className="appendix-pdf-mark"><b>PDF</b><small>{sizeLabel(file.sizeBytes)}</small></span>}
            </button>
            <div><span>{file.contentType === "application/pdf" ? "PDF DOCUMENT" : "IMAGE REFERENCE"}</span><h3>{file.title}</h3>{file.description && <p>{file.description}</p>}<small>{file.contributor ? `${file.contributor} · ` : ""}{sizeLabel(file.sizeBytes)}</small></div>
            {isAdmin && <button type="button" disabled={saving} onClick={() => void remove(file)}>삭제</button>}
          </article>
        ))}
        {!loading && !showIshigakiGuide && files.length === 0 && <div className="appendix-library-empty"><span>▱</span><h3>첫 참고 자료를 추가해 주세요.</h3><p>가격표, 안내문과 예약에 필요한 PDF를 일행과 공유할 수 있습니다.</p></div>}
        {loading && <div className="appendix-library-empty"><span className="weather-loader" /><p>참고 자료를 불러오는 중…</p></div>}
      </div>

      {preview && (
        <div className="underwater-lightbox" role="presentation" onMouseDown={() => setPreview(null)}>
          <section
            className="underwater-lightbox-dialog appendix-lightbox-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`${preview.title} 참고 자료 보기`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="underwater-lightbox-close" type="button" onClick={() => setPreview(null)} aria-label="팝업 닫기">×</button>
            {preview.contentType === "application/pdf" ? (
              <iframe src={preview.fileUrl} title={preview.title} />
            ) : (
              <img src={preview.fileUrl} alt={preview.title} />
            )}
            <div className="underwater-lightbox-caption appendix-lightbox-caption">
              <div><strong>{preview.title}</strong>{preview.description && <p>{preview.description}</p>}</div>
              <span>{preview.meta}</span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
