export type LocalModelBridge = {
  id: string;
  label: string;
  filename: string;
  sizeBytes: number;
  minRamGb: number;
  license: string;
  bundled: boolean;
  description?: string;
  installed: boolean;
  active: boolean;
  canFit: boolean;
  download: {
    inProgress: boolean;
    received: number;
    total: number;
    percent: number;
  };
};

export type LocalLlmBridgeStatus = {
  ready: boolean;
  activeModelId: string | null;
  baseUrl: string;
  error: string | null;
  models: LocalModelBridge[];
  llamaBinaryPresent?: boolean;
};

export type DesktopUpdateStatus = {
  status:
    | "idle"
    | "dev"
    | "checking"
    | "available"
    | "up-to-date"
    | "downloading"
    | "ready"
    | "error";
  version?: string;
  percent?: number;
  message?: string;
  error?: string;
};

export type AgentPilotsDesktopApi = {
  isDesktop: true;
  getVersion: () => Promise<string>;
  models: {
    list: () => Promise<LocalModelBridge[]>;
    status: () => Promise<LocalLlmBridgeStatus>;
    setActive: (id: string) => Promise<LocalLlmBridgeStatus>;
    download: (id: string) => Promise<LocalModelBridge | undefined>;
    cancelDownload: (id: string) => Promise<boolean>;
    onStatus: (cb: (payload: LocalLlmBridgeStatus) => void) => () => void;
    onDownloadProgress: (
      cb: (payload: { id: string; received: number; total: number }) => void,
    ) => () => void;
  };
  updates: {
    status: () => Promise<DesktopUpdateStatus>;
    check: () => Promise<DesktopUpdateStatus | { status: string }>;
    install: () => Promise<boolean>;
    onStatus: (cb: (payload: DesktopUpdateStatus) => void) => () => void;
  };
};
