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

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) return setMessage("업로드할 파일을 선택해 주세요.");
    if (file.size > 10 * 1024 * 1024) return setMessage("파일 크기는 10MB 이하여야 합니다.");
    formData.append("destinationId", destinationId);
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/appendix", { method: "POST", body: formData });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "자료를 업로드하지 못했습니다.");
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
        <div className="appendix-upload-title"><span>＋</span><div><strong>참고 자료 추가</strong><small>JPG · PNG · WEBP · PDF / 최대 10MB</small></div></div>
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
            <a href="/marinchu-ishigaki-appendix.jpeg" target="_blank" rel="noreferrer">
              <Image src="/marinchu-ishigaki-appendix.jpeg" width={1072} height={1527} sizes="(max-width: 720px) 100vw, 420px" alt="마린츄 이시가키 프로그램과 가격 안내" />
            </a>
            <div><span>APPENDIX · ORIGINAL</span><h3>마린츄 이시가키 참고 안내</h3><p>다이빙·스노클링·크루즈 프로그램과 가격 및 연락처</p><small>기본 제공 자료</small></div>
          </article>
        )}
        {files.map((file) => (
          <article className={`appendix-file-card ${file.contentType.startsWith("image/") ? "is-image" : "is-pdf"}`} key={file.id}>
            <a href={file.fileUrl} target="_blank" rel="noreferrer">
              {file.contentType.startsWith("image/") ? <img src={file.fileUrl} alt={file.title} loading="lazy" /> : <span className="appendix-pdf-mark"><b>PDF</b><small>{sizeLabel(file.sizeBytes)}</small></span>}
            </a>
            <div><span>{file.contentType === "application/pdf" ? "PDF DOCUMENT" : "IMAGE REFERENCE"}</span><h3>{file.title}</h3>{file.description && <p>{file.description}</p>}<small>{file.contributor ? `${file.contributor} · ` : ""}{sizeLabel(file.sizeBytes)}</small></div>
            {isAdmin && <button type="button" disabled={saving} onClick={() => void remove(file)}>삭제</button>}
          </article>
        ))}
        {!loading && !showIshigakiGuide && files.length === 0 && <div className="appendix-library-empty"><span>▱</span><h3>첫 참고 자료를 추가해 주세요.</h3><p>가격표, 안내문과 예약에 필요한 PDF를 일행과 공유할 수 있습니다.</p></div>}
        {loading && <div className="appendix-library-empty"><span className="weather-loader" /><p>참고 자료를 불러오는 중…</p></div>}
      </div>
    </div>
  );
}
