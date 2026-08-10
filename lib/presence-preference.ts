export type ManualPresenceStatus = "online" | "busy";

const STORAGE_KEY = "agentpilots:presence-status";
const EVENT_NAME = "agentpilots:presence-change";

function isManualStatus(value: unknown): value is ManualPresenceStatus {
  return value === "online" || value === "busy";
}

export function getPresencePreference(): ManualPresenceStatus {
  if (typeof window === "undefined") return "online";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // Legacy "away" was auto-set from tab visibility — never a manual busy.
    if (raw === "away") {
      window.localStorage.setItem(STORAGE_KEY, "online");
      return "online";
    }
    if (isManualStatus(raw)) return raw;
  } catch {
    // ignore storage errors
  }
  return "online";
}

export function setPresencePreference(status: ManualPresenceStatus) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, status);
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: status }));
}

export function subscribePresencePreference(
  onChange: (status: ManualPresenceStatus) => void,
): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<ManualPresenceStatus>).detail;
    if (isManualStatus(detail)) onChange(detail);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    onChange(getPresencePreference());
  };
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", onStorage);
  };
}
