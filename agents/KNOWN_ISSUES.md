# KNOWN_ISSUES.md — Deferred Findings and Technical Debt

Running log of issues identified in code reviews (Codex, DeepSeek) that were not fixed immediately. Read this before starting any new work session to avoid re-discovering known problems.

Each entry records the source, severity, current status, and what would be needed to fix it.

---

## Open

### CI — TypeScript type-check missing
**Source:** DeepSeek CI review · **Severity:** Medium  
**Detail:** `src/index.d.ts` is the public API surface but is never validated by `tsc`. If the declarations drift from the implementation (e.g. a method is removed from `latency-test-element.js` but stays in the `.d.ts`), consumers get wrong types with no CI signal.  
**Blocker:** No `tsconfig.json` exists. A proper check requires either a `tsconfig.json` with `checkJs: true` covering the JS source, or at minimum a `tsconfig.json` that validates the `.d.ts` in isolation. Without one, `tsc --noEmit` has no context.  
**Fix:** Add `tsconfig.json` to the repo (or a `tsconfig.check.json` for CI only), then add `npx tsc --noEmit` as a CI step in `.github/workflows/ci.yml`.

---

### CI — Branch protection on `main` not enforced
**Source:** DeepSeek CI review · **Severity:** Low  
**Detail:** Direct pushes to `main` bypass CI entirely. `docs.yml` deploys on `main` push but runs no quality checks. A bad direct push would deploy broken docs or a broken bundle.  
**Fix:** GitHub Settings → Branches → Add rule for `main`: enable "Require a pull request before merging" and "Require status checks to pass before merging", select the `CI` check. This is a repository settings action, not a code change.

---

### CI — Node version inconsistency
**Source:** DeepSeek CI review · **Severity:** Low  
**Detail:** `.nvmrc` pins `22`, `docs.yml` runs Node 24. `package.json` declares `engines: >=18`. Developer and CI environments differ by two major versions; low risk since the package is browser-side.  
**Options:** (a) Keep as-is and accept the gap. (b) Align `docs.yml` to Node 22 to match `.nvmrc`.  
**Current decision:** Keep as-is, accepted as low risk.

---

### CI — No `npm audit` step
**Source:** DeepSeek CI review · **Severity:** Low  
**Detail:** Dependency vulnerabilities are not checked in CI. Given the package has only two devDependencies (`esbuild`, `vitepress`) this is low risk, but a compromised transitive dependency would go undetected until manually run.  
**Fix:** Add `npm audit --audit-level=high` as a CI step, or use `npm audit` with a threshold that doesn't break on informational advisories.

---

### CDN examples unversioned
**Source:** Codex post-publish audit · **Severity:** P3  
**Detail:** `docs/install.md` CDN examples use unversioned URLs (`@adasp/latency-test/dist/...`), always resolving to latest. For production docs, pinned URLs (`@adasp/latency-test@1.0.1/dist/...`) are recommended so that consumers are not silently broken by a future major release.  
**Fix:** Update `docs/install.md` CDN section to show both patterns: a pinned example (`@1.0.1`) as the recommended production approach, and the unpinned URL labelled as "always latest."

---

### Framework examples not verified against published package
**Source:** `agents/CLAUDE_REVIEW.md` Phase 6 gate · **Severity:** Low  
**Detail:** The six framework example pages (`docs/examples/*.md`) were updated based on the local source but have not been verified end-to-end against the actual installed npm package. Draft notices were removed trusting the code to be correct — if an example has a subtle error it would only surface during a consumer's actual use.  
**Fix:** For each framework: install `@adasp/latency-test` in a fresh project, follow the example page instructions exactly, confirm the component registers and emits events correctly. Only then is the example considered fully verified.

---

### Firefox MLS sound issue (dev-test pages only)
**Source:** Manual testing during session · **Severity:** Unknown  
**Detail:** On Firefox macOS, the MLS signal sounds "weird" (distorted or incorrectly encoded) when using `src/dev-test/` pages (served via `npm run dev`, ES module source). The issue does not reproduce on the built demo (`npm run demo`, IIFE bundle) or on Chrome dev-test. Suspected cause: Firefox version-specific behavior with module workers loaded from a URL vs. a Blob. Not reproduced consistently — may be a specific Firefox version quirk.  
**Investigation needed:** Enable `debug` attribute on the `<latency-test>` element, check console for sampleRate mismatch, check for worker load errors in Firefox. Compare `audioContext.sampleRate` between dev-test and demo in Firefox.  
**Current status:** Not resolved. Deferred — does not affect the published package (which uses the built bundle).

---

## Resolved (for reference)

| Issue | Fixed in | How |
|---|---|---|
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
