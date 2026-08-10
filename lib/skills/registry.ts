export type RegistrySkillHit = {
  id: string;
  name: string;
  description: string;
  source_url: string;
  source_registry: "agentskillexchange" | "skillmd" | "custom";
  skill_md_url?: string | null;
  stars?: number | null;
  downloads?: number | null;
  category?: string | null;
};

type ExchangeSkill = {
  id?: string;
  slug?: string;
  name?: string;
  title?: string;
  description?: string;
  summary?: string;
  url?: string;
  homepage?: string;
  repo?: string;
  repository?: string;
  github?: string;
  source?: string;
  skill_md?: string;
  skillMd?: string;
  install_url?: string;
  stars?: number;
  downloads?: number;
  category?: string;
  categories?: string[];
};

let exchangeCache: { fetchedAt: number; items: ExchangeSkill[] } | null = null;
const CACHE_MS = 1000 * 60 * 30;

async function loadExchangeCatalog(): Promise<ExchangeSkill[]> {
  if (exchangeCache && Date.now() - exchangeCache.fetchedAt < CACHE_MS) {
    return exchangeCache.items;
  }
  try {
    const res = await fetch("https://agentskillexchange.com/skills.json", {
      next: { revalidate: 1800 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return exchangeCache?.items || [];
    const data = (await res.json()) as unknown;
    const items = Array.isArray(data)
      ? (data as ExchangeSkill[])
      : Array.isArray((data as { skills?: ExchangeSkill[] })?.skills)
        ? (data as { skills: ExchangeSkill[] }).skills
        : [];
    exchangeCache = { fetchedAt: Date.now(), items };
    return items;
  } catch {
    return exchangeCache?.items || [];
  }
}

function toHit(s: ExchangeSkill): RegistrySkillHit {
  const source =
    s.source ||
    s.homepage ||
    s.url ||
    s.repo ||
    s.repository ||
    s.github ||
    s.install_url ||
    "";
  const id = String(s.id || s.slug || source || s.name || crypto.randomUUID());
  return {
    id,
    name: s.name || s.title || "Untitled skill",
    description: s.description || s.summary || "",
    source_url: source || `https://agentskillexchange.com/`,
    source_registry: "agentskillexchange",
    skill_md_url: s.skill_md || s.skillMd || null,
    stars: typeof s.stars === "number" ? s.stars : null,
    downloads: typeof s.downloads === "number" ? s.downloads : null,
    category: s.category || s.categories?.[0] || null,
  };
}

export async function searchSkillRegistry(
  query: string,
  limit = 20,
): Promise<RegistrySkillHit[]> {
  const q = query.trim().toLowerCase();
  const items = await loadExchangeCatalog();
  if (!q) {
    return items.slice(0, limit).map(toHit);
  }
  const scored = items
    .map((s) => {
      const hay = [
        s.name,
        s.title,
        s.description,
        s.summary,
        s.category,
        ...(s.categories || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const score =
        (hay.includes(q) ? 10 : 0) +
        (s.name?.toLowerCase().includes(q) ? 5 : 0) +
        (s.description?.toLowerCase().includes(q) ? 2 : 0);
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.s.stars || 0) - (a.s.stars || 0));

  return scored.slice(0, limit).map((x) => toHit(x.s));
}

/** Resolve a likely raw SKILL.md URL from a registry hit or user-provided URL. */
export function resolveSkillMdFetchUrl(opts: {
  source_url: string;
  skill_md_url?: string | null;
}): string {
  if (opts.skill_md_url) return opts.skill_md_url;
  const u = opts.source_url;
  if (/SKILL\.md(\?|$)/i.test(u)) return toRawGithubIfNeeded(u);
  if (/github\.com\/[^/]+\/[^/]+\/?$/i.test(u.replace(/\.git$/, ""))) {
    const base = u.replace(/\.git$/, "").replace(/\/$/, "");
    return `${base.replace("github.com", "raw.githubusercontent.com")}/main/SKILL.md`;
  }
  if (u.includes("raw.githubusercontent.com")) return u;
  return toRawGithubIfNeeded(u);
}

function toRawGithubIfNeeded(url: string): string {
  const m = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i,
  );
  if (m) {
    return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
  }
  return url;
}

export async function fetchSkillMdContent(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { Accept: "text/plain, text/markdown, */*" },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch SKILL.md (${res.status})`);
  }
  const text = await res.text();
  if (!text.trim()) throw new Error("SKILL.md was empty");
  return text;
}
