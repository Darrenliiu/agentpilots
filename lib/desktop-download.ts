/** Public Windows installer URL (GitHub release, CDN, etc.). */
export function getWindowsDownloadUrl() {
  return (
    process.env.NEXT_PUBLIC_DESKTOP_WINDOWS_URL?.trim() ||
    process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL?.trim() ||
    null
  );
}

export function getDesktopVersionLabel() {
  return process.env.NEXT_PUBLIC_DESKTOP_VERSION?.trim() || "0.1.0";
}
