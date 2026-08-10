"use client";

import { useEffect, useId, useState } from "react";

export type MessageMediaProps = {
  url: string;
  mime?: string | null;
  kind?: "image" | "video" | string | null;
  alt?: string;
  downloadName?: string;
};

function resolveKind(
  mime: string | null | undefined,
  kind: string | null | undefined,
): "image" | "video" {
  if (kind === "video" || mime?.startsWith("video/")) return "video";
  return "image";
}

function downloadFilename(
  url: string,
  mime: string | null | undefined,
  kind: "image" | "video",
  explicit?: string,
) {
  if (explicit) return explicit;
  try {
    const path = new URL(url).pathname;
    const base = path.split("/").pop();
    if (base && base.includes(".")) return base;
  } catch {
    // ignore
  }
  if (mime?.includes("mp4")) return "generated.mp4";
  if (mime?.includes("webm")) return "generated.webm";
  if (mime?.includes("jpeg") || mime?.includes("jpg")) return "generated.jpg";
  if (mime?.includes("webp")) return "generated.webp";
  return kind === "video" ? "generated.mp4" : "generated.png";
}

export function MessageMedia({
  url,
  mime,
  kind,
  alt = "Generated media",
  downloadName,
}: MessageMediaProps) {
  const mediaKind = resolveKind(mime, kind);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const titleId = useId();
  const filename = downloadFilename(url, mime, mediaKind, downloadName);

  useEffect(() => {
    if (!lightboxOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [lightboxOpen]);

  return (
    <div className="message-media">
      {mediaKind === "video" ? (
        <video
          className="message-media__video"
          src={url}
          controls
          playsInline
          preload="metadata"
        />
      ) : (
        <button
          type="button"
          className="message-media__thumb-btn"
          onClick={() => setLightboxOpen(true)}
          aria-label="Expand image"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} className="message-media__image" />
        </button>
      )}

      <div className="message-media__actions">
        <a
          className="message-media__action"
          href={url}
          download={filename}
          target="_blank"
          rel="noreferrer"
        >
          Download
        </a>
        <a
          className="message-media__action"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          Open
        </a>
        {mediaKind === "image" ? (
          <button
            type="button"
            className="message-media__action"
            onClick={() => setLightboxOpen(true)}
          >
            Expand
          </button>
        ) : null}
      </div>

      {lightboxOpen && mediaKind === "image" ? (
        <div
          className="message-media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="message-media-lightbox__panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="message-media-lightbox__bar">
              <span id={titleId} className="message-media-lightbox__title">
                {alt}
              </span>
              <div className="message-media-lightbox__bar-actions">
                <a
                  className="message-media__action"
                  href={url}
                  download={filename}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download
                </a>
                <button
                  type="button"
                  className="message-media__action"
                  onClick={() => setLightboxOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={alt}
              className="message-media-lightbox__img"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
