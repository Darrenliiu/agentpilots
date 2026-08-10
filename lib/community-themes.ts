export type CommunityThemeId =
  | "default"
  | "midnight"
  | "slate"
  | "ocean"
  | "forest"
  | "sand"
  | "sunset"
  | "ink-paper"
  | "blush"
  | "aurora";

export type CommunityThemeTokens = {
  "--bg": string;
  "--bg-deep": string;
  "--ink": string;
  "--ink-muted": string;
  "--panel": string;
  "--line": string;
  "--accent": string;
  "--accent-2": string;
  "--agent": string;
  "--danger": string;
  "--glow": string;
  "--field-bg": string;
  "--hover": string;
  "--chip-bg": string;
  "--avatar-fallback": string;
  "--presence-ring": string;
};

export type CommunityTheme = {
  id: CommunityThemeId;
  label: string;
  description: string;
  tokens: CommunityThemeTokens;
};

export const COMMUNITY_THEMES: readonly CommunityTheme[] = [
  {
    id: "default",
    label: "Parchment",
    description: "Warm cream with teal accents",
    tokens: {
      "--bg": "#f3efe6",
      "--bg-deep": "#e7e0d2",
      "--ink": "#14201c",
      "--ink-muted": "#4d5c56",
      "--panel": "rgba(255, 252, 246, 0.86)",
      "--line": "rgba(20, 32, 28, 0.12)",
      "--accent": "#0f766e",
      "--accent-2": "#c45c26",
      "--agent": "#1d4e89",
      "--danger": "#b42318",
      "--glow":
        "radial-gradient(circle at 20% 20%, rgba(15, 118, 110, 0.18), transparent 40%), radial-gradient(circle at 80% 0%, rgba(196, 92, 38, 0.16), transparent 35%), linear-gradient(160deg, #f7f3ea 0%, #ebe4d6 45%, #dfeae6 100%)",
      "--field-bg": "rgba(255, 255, 255, 0.7)",
      "--hover": "rgba(20, 32, 28, 0.05)",
      "--chip-bg": "rgba(255, 252, 246, 0.95)",
      "--avatar-fallback": "rgba(20, 32, 28, 0.08)",
      "--presence-ring": "rgba(255, 252, 246, 0.9)",
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Near-black with soft light text",
    tokens: {
      "--bg": "#0c1018",
      "--bg-deep": "#151b26",
      "--ink": "#e8edf5",
      "--ink-muted": "#9aa8bc",
      "--panel": "rgba(22, 28, 40, 0.9)",
      "--line": "rgba(232, 237, 245, 0.12)",
      "--accent": "#3d9bfd",
      "--accent-2": "#f0a060",
      "--agent": "#7eb6ff",
      "--danger": "#f07178",
      "--glow":
        "radial-gradient(circle at 18% 15%, rgba(61, 155, 253, 0.22), transparent 42%), radial-gradient(circle at 85% 5%, rgba(240, 160, 96, 0.12), transparent 38%), linear-gradient(165deg, #0a0e16 0%, #121826 50%, #0e1620 100%)",
      "--field-bg": "rgba(10, 14, 22, 0.65)",
      "--hover": "rgba(232, 237, 245, 0.06)",
      "--chip-bg": "rgba(28, 36, 52, 0.95)",
      "--avatar-fallback": "rgba(232, 237, 245, 0.1)",
      "--presence-ring": "rgba(22, 28, 40, 0.95)",
    },
  },
  {
    id: "slate",
    label: "Slate",
    description: "Cool charcoal surfaces",
    tokens: {
      "--bg": "#1a1d23",
      "--bg-deep": "#242830",
      "--ink": "#eceff4",
      "--ink-muted": "#a0a8b4",
      "--panel": "rgba(36, 40, 48, 0.92)",
      "--line": "rgba(236, 239, 244, 0.12)",
      "--accent": "#6b8cae",
      "--accent-2": "#c4a882",
      "--agent": "#8fb4d9",
      "--danger": "#e06c75",
      "--glow":
        "radial-gradient(circle at 25% 20%, rgba(107, 140, 174, 0.2), transparent 40%), radial-gradient(circle at 80% 10%, rgba(196, 168, 130, 0.1), transparent 35%), linear-gradient(160deg, #16191f 0%, #1e2229 50%, #1a1f26 100%)",
      "--field-bg": "rgba(14, 16, 20, 0.7)",
      "--hover": "rgba(236, 239, 244, 0.06)",
      "--chip-bg": "rgba(42, 46, 56, 0.95)",
      "--avatar-fallback": "rgba(236, 239, 244, 0.1)",
      "--presence-ring": "rgba(36, 40, 48, 0.95)",
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Deep teal-blue waters",
    tokens: {
      "--bg": "#0a1a22",
      "--bg-deep": "#122830",
      "--ink": "#e4f2f6",
      "--ink-muted": "#8fb4c0",
      "--panel": "rgba(16, 36, 44, 0.9)",
      "--line": "rgba(228, 242, 246, 0.12)",
      "--accent": "#2aa8a0",
      "--accent-2": "#e8a05c",
      "--agent": "#5ec4d4",
      "--danger": "#e8746a",
      "--glow":
        "radial-gradient(circle at 20% 18%, rgba(42, 168, 160, 0.25), transparent 42%), radial-gradient(circle at 88% 8%, rgba(94, 196, 212, 0.14), transparent 36%), linear-gradient(165deg, #07141a 0%, #0e222a 48%, #0a1c24 100%)",
      "--field-bg": "rgba(6, 18, 24, 0.7)",
      "--hover": "rgba(228, 242, 246, 0.06)",
      "--chip-bg": "rgba(20, 44, 52, 0.95)",
      "--avatar-fallback": "rgba(228, 242, 246, 0.1)",
      "--presence-ring": "rgba(16, 36, 44, 0.95)",
    },
  },
  {
    id: "forest",
    label: "Forest",
    description: "Dark green canopy",
    tokens: {
      "--bg": "#0f1a14",
      "--bg-deep": "#18261c",
      "--ink": "#e6f0e8",
      "--ink-muted": "#8fa898",
      "--panel": "rgba(22, 36, 28, 0.9)",
      "--line": "rgba(230, 240, 232, 0.12)",
      "--accent": "#3d9a6a",
      "--accent-2": "#d4a054",
      "--agent": "#6bb8a0",
      "--danger": "#d96b5c",
      "--glow":
        "radial-gradient(circle at 22% 16%, rgba(61, 154, 106, 0.22), transparent 42%), radial-gradient(circle at 82% 6%, rgba(212, 160, 84, 0.12), transparent 36%), linear-gradient(160deg, #0b1410 0%, #142018 50%, #101c16 100%)",
      "--field-bg": "rgba(8, 16, 12, 0.7)",
      "--hover": "rgba(230, 240, 232, 0.06)",
      "--chip-bg": "rgba(28, 44, 34, 0.95)",
      "--avatar-fallback": "rgba(230, 240, 232, 0.1)",
      "--presence-ring": "rgba(22, 36, 28, 0.95)",
    },
  },
  {
    id: "sand",
    label: "Sand",
    description: "Warm light beige",
    tokens: {
      "--bg": "#f5efe4",
      "--bg-deep": "#ebe2d2",
      "--ink": "#2c2418",
      "--ink-muted": "#6b5e4e",
      "--panel": "rgba(255, 250, 242, 0.88)",
      "--line": "rgba(44, 36, 24, 0.12)",
      "--accent": "#8b5e3c",
      "--accent-2": "#c4783a",
      "--agent": "#3d6b8a",
      "--danger": "#b33a2e",
      "--glow":
        "radial-gradient(circle at 20% 20%, rgba(139, 94, 60, 0.14), transparent 40%), radial-gradient(circle at 80% 0%, rgba(196, 120, 58, 0.12), transparent 35%), linear-gradient(160deg, #f8f3ea 0%, #efe6d8 45%, #e8e0d0 100%)",
      "--field-bg": "rgba(255, 255, 255, 0.72)",
      "--hover": "rgba(44, 36, 24, 0.05)",
      "--chip-bg": "rgba(255, 250, 242, 0.95)",
      "--avatar-fallback": "rgba(44, 36, 24, 0.08)",
      "--presence-ring": "rgba(255, 250, 242, 0.9)",
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Peach sky with terracotta",
    tokens: {
      "--bg": "#faf0e8",
      "--bg-deep": "#f0ddd0",
      "--ink": "#2a1810",
      "--ink-muted": "#7a5648",
      "--panel": "rgba(255, 248, 242, 0.88)",
      "--line": "rgba(42, 24, 16, 0.12)",
      "--accent": "#c45c26",
      "--accent-2": "#d4890a",
      "--agent": "#1d5a7a",
      "--danger": "#b42318",
      "--glow":
        "radial-gradient(circle at 18% 18%, rgba(196, 92, 38, 0.18), transparent 40%), radial-gradient(circle at 85% 5%, rgba(212, 137, 10, 0.14), transparent 36%), linear-gradient(160deg, #fff5ee 0%, #f5e4d8 48%, #ebe0d8 100%)",
      "--field-bg": "rgba(255, 255, 255, 0.72)",
      "--hover": "rgba(42, 24, 16, 0.05)",
      "--chip-bg": "rgba(255, 248, 242, 0.95)",
      "--avatar-fallback": "rgba(42, 24, 16, 0.08)",
      "--presence-ring": "rgba(255, 248, 242, 0.9)",
    },
  },
  {
    id: "ink-paper",
    label: "Ink & Paper",
    description: "High-contrast light",
    tokens: {
      "--bg": "#f7f7f5",
      "--bg-deep": "#ebebe8",
      "--ink": "#111111",
      "--ink-muted": "#5a5a5a",
      "--panel": "rgba(255, 255, 255, 0.92)",
      "--line": "rgba(17, 17, 17, 0.14)",
      "--accent": "#111111",
      "--accent-2": "#555555",
      "--agent": "#1a3a6e",
      "--danger": "#b42318",
      "--glow":
        "radial-gradient(circle at 20% 20%, rgba(17, 17, 17, 0.06), transparent 40%), linear-gradient(160deg, #fafaf8 0%, #f0f0ed 50%, #e8e8e4 100%)",
      "--field-bg": "rgba(255, 255, 255, 0.85)",
      "--hover": "rgba(17, 17, 17, 0.05)",
      "--chip-bg": "rgba(255, 255, 255, 0.98)",
      "--avatar-fallback": "rgba(17, 17, 17, 0.08)",
      "--presence-ring": "rgba(255, 255, 255, 0.95)",
    },
  },
  {
    id: "blush",
    label: "Blush",
    description: "Soft rose light",
    tokens: {
      "--bg": "#f8ecee",
      "--bg-deep": "#efdde2",
      "--ink": "#2a181c",
      "--ink-muted": "#7a5560",
      "--panel": "rgba(255, 248, 249, 0.88)",
      "--line": "rgba(42, 24, 28, 0.12)",
      "--accent": "#b54a62",
      "--accent-2": "#c4783a",
      "--agent": "#3d5a8a",
      "--danger": "#b42318",
      "--glow":
        "radial-gradient(circle at 20% 18%, rgba(181, 74, 98, 0.16), transparent 40%), radial-gradient(circle at 82% 5%, rgba(196, 120, 58, 0.1), transparent 35%), linear-gradient(160deg, #fdf4f6 0%, #f3e4e8 48%, #ebe0e4 100%)",
      "--field-bg": "rgba(255, 255, 255, 0.72)",
      "--hover": "rgba(42, 24, 28, 0.05)",
      "--chip-bg": "rgba(255, 248, 249, 0.95)",
      "--avatar-fallback": "rgba(42, 24, 28, 0.08)",
      "--presence-ring": "rgba(255, 248, 249, 0.9)",
    },
  },
  {
    id: "aurora",
    label: "Aurora",
    description: "Cool mint light",
    tokens: {
      "--bg": "#eaf4f1",
      "--bg-deep": "#d8ebe5",
      "--ink": "#12241f",
      "--ink-muted": "#4a6b62",
      "--panel": "rgba(248, 252, 250, 0.88)",
      "--line": "rgba(18, 36, 31, 0.12)",
      "--accent": "#0d8a75",
      "--accent-2": "#3d7a9a",
      "--agent": "#1d5a8a",
      "--danger": "#b42318",
      "--glow":
        "radial-gradient(circle at 18% 18%, rgba(13, 138, 117, 0.16), transparent 40%), radial-gradient(circle at 85% 5%, rgba(61, 122, 154, 0.12), transparent 36%), linear-gradient(160deg, #f0f8f5 0%, #e2efe9 48%, #d8eae8 100%)",
      "--field-bg": "rgba(255, 255, 255, 0.72)",
      "--hover": "rgba(18, 36, 31, 0.05)",
      "--chip-bg": "rgba(248, 252, 250, 0.95)",
      "--avatar-fallback": "rgba(18, 36, 31, 0.08)",
      "--presence-ring": "rgba(248, 252, 250, 0.9)",
    },
  },
] as const;

const THEME_BY_ID = Object.fromEntries(
  COMMUNITY_THEMES.map((t) => [t.id, t]),
) as Record<CommunityThemeId, CommunityTheme>;

export const DEFAULT_COMMUNITY_THEME_ID: CommunityThemeId = "default";

export function isCommunityThemeId(value: string): value is CommunityThemeId {
  return value in THEME_BY_ID;
}

export function getCommunityTheme(id: string | null | undefined): CommunityTheme {
  if (id && isCommunityThemeId(id)) return THEME_BY_ID[id];
  return THEME_BY_ID[DEFAULT_COMMUNITY_THEME_ID];
}
