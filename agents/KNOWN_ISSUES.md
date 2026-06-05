# KNOWN_ISSUES.md — Deferred Findings and Technical Debt

Running log of issues identified in code reviews (Codex, DeepSeek) that were not fixed immediately. Read this before starting any new work session to avoid re-discovering known problems.

Each entry records the source, severity, current status, and what would be needed to fix it.

---

## Open

### Framework examples not verified against published package
**Source:** `agents/CLAUDE_REVIEW.md` Phase 6 gate · **Severity:** Low  
**Detail:** The six framework example pages (`docs/examples/*.md`) were updated based on the local source but have not been verified end-to-end against the actual installed npm package. Draft notices were removed trusting the code to be correct — if an example has a subtle error it would only surface during a consumer's actual use.  
**Fix:** For each framework: install `@adasp/latency-test` in a fresh project, follow the example page instructions exactly, confirm the component registers and emits events correctly. Only then is the example considered fully verified.

---

## Resolved (for reference)

| Issue | Fixed in | How |
|---|---|---|
| CI — Branch protection on `main` | 2026-06-05 | Configured in GitHub Settings: PR required before merging, CI status check required to pass. |
| CDN examples unversioned | v1.0.2 | All CDN URLs in `docs/install.md` pinned to `@1.0.2` (jsDelivr + unpkg, ESM + IIFE). |
| CI — TypeScript type-check missing | 2026-06-05 | `tsconfig.json` added (`noEmit`, `strict`, `lib: ["dom","es2020"]`); `npm run typecheck` added to scripts and `ci.yml`. Validates `.d.ts` type correctness only — does not catch implementation drift. |
| CI — Node version divergence | 2026-06-05 | Intentional and documented. `.nvmrc=22` (local dev), `ci.yml=20` (test/build job), `docs.yml=24` (Pages build/deploy workflow). All satisfy `engines: >=18`. No alignment needed. |
| CI — No `npm audit` step | 2026-06-05 | `npm audit --audit-level=high` added to `ci.yml` after "Install dependencies". |
| Firefox MLS sound issue (dev-test) | 2026-06-05 | Tested across multiple devices; behavior was as expected. Not reproduced on other devices. Closed. |
| Worker errors not surfaced to host | v1.0.1 | `onError` routing + `!this.stopped` guard |
| Startup error leaks stream/worker | v1.0.1 | `start()` catch block cleanup + state reset |
| Public property defaults missing | v1.0.1 | Class field defaults on `LatencyTestElement` |
| `signalType` overclaiming chirp/Golay | v1.0.1 | Narrowed to `'mls'` in `src/index.d.ts` |
| Duplicate `inputGain` declaration | v1.0.1 | Removed unannotated copy |
| `e.detail.latency` on `latency-complete` | v1.0.1 | Fixed to `e.detail.mean.toFixed(2)` |
| Draft notices in docs/examples | v1.0.0/v1.0.1 | Removed across all pages |
| TypeScript workarounds in framework examples | v1.0.1 | Replaced with `import type { LatencyTestElement }` |
| `package-lock.json` stale after rename | v1.0.0 | Regenerated via `npm install` |
| CI double-run on PR push | CI setup | `concurrency` group added to `ci.yml` |
