"use client";

import { useState, useTransition } from "react";
import type { Skill } from "@/lib/types";

type RegistryHit = {
  id: string;
  name: string;
  description: string;
  source_url: string;
  source_registry: string;
  skill_md_url?: string | null;
  stars?: number | null;
  category?: string | null;
};

export function SkillsSettingsPanel({
  communityId,
  isAdmin,
  skills,
  importAction,
  createAction,
  toggleAction,
  deleteAction,
}: {
  communityId: string;
  isAdmin: boolean;
  skills: Skill[];
  importAction: (formData: FormData) => Promise<{ error?: string } | void>;
  createAction: (formData: FormData) => Promise<{ error?: string } | void>;
  toggleAction: (formData: FormData) => Promise<{ error?: string } | void>;
  deleteAction: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<RegistryHit[]>([]);
  const [searching, setSearching] = useState(false);

  function run(
    action: (fd: FormData) => Promise<{ error?: string } | void>,
    fd: FormData,
  ) {
    start(async () => {
      const res = await action(fd);
      if (res && "error" in res && res.error) setError(res.error);
      else setError(null);
    });
  }

  async function search() {
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/skills/search?q=${encodeURIComponent(query)}&limit=15`,
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setHits(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="stack">
      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <p className="muted text-sm">
        Skills are SKILL.md instruction packs. Imports keep a source link back
        to the registry or repository. Treated as untrusted prompt text — no
        scripts are executed.
      </p>

      {isAdmin ? (
        <section className="panel rounded-2xl p-5">
          <h2 className="mb-3 text-lg font-semibold">
            Browse Agent Skill Exchange
          </h2>
          <div className="flex gap-2">
            <input
              className="field flex-1"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search skills (e.g. code review, postgres)"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
            />
            <button
              className="btn"
              type="button"
              disabled={searching}
              onClick={() => void search()}
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {hits.map((hit) => (
              <div
                key={hit.id}
                className="flex flex-wrap items-start justify-between gap-3 border-b pb-3"
                style={{ borderColor: "var(--line)" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{hit.name}</div>
                  <p className="muted text-sm">{hit.description}</p>
                  <a
                    className="text-sm underline"
                    href={hit.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View source
                  </a>
                  {hit.category ? (
                    <span className="muted ml-2 text-xs">{hit.category}</span>
                  ) : null}
                </div>
                <form action={(fd) => run(importAction, fd)}>
                  <input type="hidden" name="community_id" value={communityId} />
                  <input type="hidden" name="source_url" value={hit.source_url} />
                  <input
                    type="hidden"
                    name="skill_md_url"
                    value={hit.skill_md_url || ""}
                  />
                  <input
                    type="hidden"
                    name="source_registry"
                    value={hit.source_registry}
                  />
                  <input type="hidden" name="source_id" value={hit.id} />
                  <input type="hidden" name="name" value={hit.name} />
                  <input
                    type="hidden"
                    name="description"
                    value={hit.description}
                  />
                  <button className="btn secondary" type="submit" disabled={pending}>
                    Import
                  </button>
                </form>
              </div>
            ))}
            {!hits.length && !searching ? (
              <p className="muted text-sm">
                Search the public catalog, then import a skill with its source
                link.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="panel rounded-2xl p-5">
        <h2 className="mb-3 text-lg font-semibold">Community skills</h2>
        {skills.length === 0 ? (
          <p className="muted text-sm">No skills imported yet.</p>
        ) : (
          <div className="space-y-4">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--line)" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {skill.name}{" "}
                      {!skill.enabled ? (
                        <span className="muted text-xs">(disabled)</span>
                      ) : null}
                    </div>
                    <p className="muted text-sm">{skill.description}</p>
                    <a
                      className="text-sm underline"
                      href={skill.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View source
                    </a>
                  </div>
                  {isAdmin ? (
                    <div className="flex gap-2">
                      <form action={(fd) => run(toggleAction, fd)}>
                        <input type="hidden" name="community_id" value={communityId} />
                        <input type="hidden" name="skill_id" value={skill.id} />
                        <input
                          type="hidden"
                          name="enabled"
                          value={skill.enabled ? "false" : "true"}
                        />
                        <button className="btn secondary" type="submit" disabled={pending}>
                          {skill.enabled ? "Disable" : "Enable"}
                        </button>
                      </form>
                      <form action={(fd) => run(deleteAction, fd)}>
                        <input type="hidden" name="community_id" value={communityId} />
                        <input type="hidden" name="skill_id" value={skill.id} />
                        <button className="btn secondary" type="submit" disabled={pending}>
                          Delete
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {isAdmin ? (
        <section className="panel rounded-2xl p-5">
          <h2 className="mb-3 text-lg font-semibold">Paste custom SKILL.md</h2>
          <form className="stack" action={(fd) => run(createAction, fd)}>
            <input type="hidden" name="community_id" value={communityId} />
            <div>
              <label className="label" htmlFor="skill-name">
                Name
              </label>
              <input className="field" id="skill-name" name="name" required />
            </div>
            <div>
              <label className="label" htmlFor="skill-desc">
                Description
              </label>
              <input className="field" id="skill-desc" name="description" />
            </div>
            <div>
              <label className="label" htmlFor="skill-source">
                Source URL (required)
              </label>
              <input
                className="field"
                id="skill-source"
                name="source_url"
                placeholder="https://github.com/.../SKILL.md"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="skill-body">
                Body
              </label>
              <textarea
                className="field min-h-[160px] font-mono text-sm"
                id="skill-body"
                name="body"
                required
                placeholder={"---\nname: my-skill\ndescription: ...\n---\n\n# Instructions"}
              />
            </div>
            <button className="btn" type="submit" disabled={pending}>
              Add skill
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
