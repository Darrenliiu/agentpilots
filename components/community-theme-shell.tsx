"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  getCommunityTheme,
  type CommunityThemeId,
} from "@/lib/community-themes";

type CommunityThemeContextValue = {
  themeId: CommunityThemeId;
  setThemeId: (id: CommunityThemeId) => void;
};

const CommunityThemeContext = createContext<CommunityThemeContextValue | null>(
  null,
);

export function useCommunityTheme() {
  const ctx = useContext(CommunityThemeContext);
  if (!ctx) {
    throw new Error("useCommunityTheme must be used within CommunityThemeShell");
  }
  return ctx;
}

export function useOptionalCommunityTheme() {
  return useContext(CommunityThemeContext);
}

export function CommunityThemeShell({
  initialThemeId,
  children,
}: {
  initialThemeId: string;
  children: ReactNode;
}) {
  const [themeId, setThemeIdState] = useState<CommunityThemeId>(
    () => getCommunityTheme(initialThemeId).id,
  );

  useEffect(() => {
    setThemeIdState(getCommunityTheme(initialThemeId).id);
  }, [initialThemeId]);

  const setThemeId = useCallback((id: CommunityThemeId) => {
    setThemeIdState(id);
  }, []);

  const theme = getCommunityTheme(themeId);
  const value = useMemo(
    () => ({ themeId, setThemeId }),
    [themeId, setThemeId],
  );

  return (
    <CommunityThemeContext.Provider value={value}>
      <div
        className="app-shell min-h-screen"
        data-community-theme={theme.id}
        style={theme.tokens as CSSProperties}
      >
        {children}
      </div>
    </CommunityThemeContext.Provider>
  );
}
