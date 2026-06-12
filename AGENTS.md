# AGENTS.md

## Critical rule

Do not edit or modify existing files without explicit user confirmation.
Reading, analysis, and proposed patches are allowed. File creation or
modification requires approval first.

## Project goal

Migrate the current browser round-trip audio latency prototype into a
reusable Web Component package: `@adasp/latency-test`.
Both npm import and CDN/script-tag usage are first-class distribution targets.

## Key reference files

Before starting any work, read these files in order:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project overview, architecture, file map, data flow, browser notes |
| `agents/CLAUDE_REVIEW.md` | Full migration plan (Phases 1–7), resolved decisions, packaging checklist |
| `agents/CODEX_REVIEW.md` | Adversarial review log, open questions, architecture risks |
| `agents/CODEX_README.md` | README direction and documentation strategy |
| `agents/claude_codex_workflow_context.md` | Claude+Codex collaboration workflow design notes (some sections reference resolved branch/repo issues — see git history for context) |

Ignore `dist/`, `node_modules/`, `docs/.vitepress/cache/`.

## Current agent setup

- **openCode (DeepSeek V4 Flash Free)** — primary coding agent (this session).
  Fills the "Claude Code" role described below.
- **Claude (VS Code extension)** — secondary reviewer for cross-validation.
- **Codex (VS Code extension)** — independent adversarial reviewer.

## Agent roles

### Claude Code

Acts as **teacher and pair programmer**.

- Explains approach and tradeoffs before editing anything.
- Works in small, reviewable steps.
- Waits for user approval before modifying files.
- Teaches the reasoning behind each change — Web Components, JS architecture,
  browser APIs, Web Audio API, testing, packaging, and docs.
- Asks the user to reason about important decisions before revealing the answer.
- Does not hand the developer copy-paste code as a substitute for teaching.
  Explains what to write and why; the developer types it. Only writes or creates
  code directly when the developer explicitly asks or approves a concrete file
  change. Proposed patches shown for review are allowed.
- Helps the user evaluate Codex feedback.

**Before editing any file, Claude must:**

1. Explain the problem.
2. Explain possible approaches.
3. Recommend the smallest safe next step.
4. Wait for user approval before making significant changes.

**After Codex reviews something, Claude must:**

1. Classify Codex findings by severity.
2. Explain which findings matter now.
3. Explain which findings can wait.
4. Propose the smallest safe patch.
5. Teach the underlying engineering principle behind each important finding.

### Codex

Acts as **independent adversarial reviewer**.

- Reviews diffs and branch changes.
- Challenges migration approach, architecture, API design, browser compatibility,
  packaging, docs accuracy, and implementation risks.
- Returns prioritised findings.
- Does not rewrite the project unless explicitly asked.

**Codex commands:**

| Command | When to use |
|---------|-------------|
| `/codex:rescue --fresh --background <task>` | Onboarding, investigation, read-only delegated analysis |
| `/codex:review --background` | Review current uncommitted changes or a branch diff |
| `/codex:adversarial-review --background <focus>` | Challenge architecture, API design, browser compatibility, package structure, over-engineering |
| `/codex:status` | Check status of background Codex tasks |
| `/codex:result` | Retrieve output of a completed Codex task |

**Do not enable the review gate yet:**
`/codex:setup --enable-review-gate` can create noisy automatic Claude/Codex loops.
Manual reviews keep the learning loop intentional. Enable only when explicitly decided.

### Day-to-day loop

1. User asks Claude to plan or propose a step.
2. For non-trivial proposals (architecture, API design, tradeoffs, migration
   decisions), Claude triggers Codex to review the proposal before presenting it.
   For small or mechanical steps, Claude uses judgement.
3. Claude presents the double-checked result (proposal + Codex view) to the user.
4. User approves or redirects.
5. User types the code themselves, unless they explicitly approve Claude to make
   a concrete file change.
6. Run local checks (`npm run build`, `npm run docs:build`, `git diff`).
7. Codex reviews the current diff/uncommitted changes.
8. Claude classifies findings and proposes the smallest safe patch.
9. User decides what to accept.
10. Commit. Repeat.

> See `agents/claude_codex_workflow_context.md` for the original workflow design notes.
> Note: some sections reference an older branch state and will be revised when
> the file is migrated to a documentation page.

---

## Refined Workflow (Active Session)

This section documents the agreed collaboration approach for Jose's ongoing work on the latency-test Web Component migration.

### Pair Programming Pattern

1. **Claude proposes** the architectural/technical approach (explain problem → options → recommend next step)
2. **User types** the code (Claude provides guidance, shows diffs for reference)
3. **Claude reviews** the code and tests (spot issues, explain tradeoffs)
4. **User tests in UI** (runs `npm run dev`, validates behavior)
5. **Codex review** (Claude writes a focused prompt, user approves it, then Claude invokes `/codex:review --background` with metaprompted focus areas)

### Aggressive Codex Review

- Codex reviews **every completed block** after UI testing (not per-commit, but per logical milestone)
- Claude **writes the Codex prompt** (metaprompting) with specific focus areas
- **User reviews the prompt first** before Claude invokes Codex
- Review frequency: ~5–7 strategic reviews per phase (token-efficient, high-value)

### Error Handling & Permissions

- **User always decides** on error handling (how to fail, what to retry, what to expose)
- **Claude always asks permission** before any file edit (standard VS Code plugin workflow — no surprises)
- **Only user commits**. Claude/Codex can *propose* commits, but the user explicitly asks for them
- Commits are never automatic; they are intentional milestones

### Session Resumption

When context-switching back after days/weeks away:
- Claude auto-summarizes: `session_state` → last 5 commits → current uncommitted diff
- Claude explains the plan and asks: "Ready to continue Phase X?"
- Maintains continuity without user re-briefing

### Session Artifacts

Stored in session folder (`~/.copilot/session-state/<id>/files/`):
- **Architecture diagrams** (decision sketches, data flow diagrams)
- **Decision logs** (what was tried, why rejected, what's next)
- **plan.md** (updated end-of-session or on direction changes)

### Commit Policy

- **User-driven commits only** — Claude never commits without explicit user request
- **Propose before committing** — "Ready to commit Phase 1? Here's the summary..." → User decides
- Updates to AGENTS.md, plan.md, docs: same policy — user reviews and commits

## Current stack

- Vanilla JavaScript ES modules — TypeScript declarations ship in the package (`src/index.d.ts` → `dist/index.d.ts`); unit tests in `tests/` using `node:test`
- Web Audio API (`AudioContext`, `AudioBuffer`, `AudioBufferSourceNode`)
- Dual capture backend: `AudioWorklet` (v2 default) + `MediaRecorder` (v1 default, fallback)
- Web Worker for cross-correlation and peak detection (off main thread)
- esbuild — component bundle (ESM + IIFE outputs)
- VitePress — developer docs site (`docs/`)

## Commands

```bash
npm install
npm run dev              # static file server — serves src/ natively
npm run build:component  # produces dist/latency-test.esm.js + .iife.js
npm run docs:dev         # VitePress docs dev server (http://localhost:5173)
npm run docs:build       # Build VitePress docs
npm run docs:preview     # Preview built docs
```

## Working branch

Stable base: `main` (branch protection: PR + "ci" status check — work on a short-lived feature branch and open a PR).
Current branch state is tracked in `agents/SESSION_HANDOFF.md`.

## Migration phases

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Refactor `TestLatencyMLS` from static singleton to instance-based controller | Complete |
| 2 | Wrap controller in `<latency-test>` Custom Element with Shadow DOM | Complete |
| 3 | Replace `MediaRecorder` with `AudioWorklet` for dual-channel raw PCM capture | Complete |
| 4 | Demo page & integration (rewrite demo, multi-run, browser validation) | Complete |
| 5 | Build & distribution (esbuild, ESM + IIFE, worker/processor inlining, cross-browser test) | Complete |
| 6 | Documentation & demo (+ `buffer-size` attribute for AudioWorklet) | In progress |
| 7 | npm publishing (`@adasp/latency-test`) — see `agents/CLAUDE_REVIEW.md` Phase 7 checklist | Complete |
| 8 | Experimentation toolkit — optional visualization layer (graphs, waveforms, comparisons, host-side histogram — absorbed from Phase 4 on 2026-06-12) | Pending, optional |

Signal types (chirp logarithmic sweep, Golay complementary sequences) are deferred to v2 scope and are no longer a numbered phase.

TypeScript declaration file (`src/index.d.ts`, typed events) ships with the package as of v1.0.0.

## Resolved design decisions

Do not re-open these unless the user explicitly asks:

- `audioContext`: host-required. Must be set via `element.audioContext = ac` before calling `start()`.
  The component never creates or closes an `AudioContext`. Emits `latency-error` if missing.
- `inputStream`: host-required. Must be set via `element.inputStream = stream` before calling `start()`.
  The component never calls `getUserMedia()` or stops the stream. Emits `latency-error` if missing.
- Shadow DOM: open mode, empty root by default. No built-in visible UI in v1 (headless-first).
- `recording-mode` attribute: `"mediarecorder"` (v1 default, 2-channel) | `"mediarecorder-1ch"` (single-channel fallback) | `"audioworklet"` (v2 default).
- Lifecycle events emitted: `latency-start`, `latency-recording`, `latency-processing`,
  `latency-result`, `latency-error`, `latency-complete`.
  All events must set `bubbles: true` and `composed: true`.
- Safari gain: host-controlled via the host-gain pattern (gain chain built by the host, processed stream passed as `inputStream`). No internal browser detection, no gain attribute on the component.
- Distribution: npm + CDN are both first-class targets. Validate both before publishing.
- Measurement inherits the host's audio environment: the component does not create an
  idealized setup. The host's `AudioContext`, stream constraints, and capture backend
  define the measurement context. System buffers (e.g. Safari's ~30ms `MediaStreamSource`
  bridge) are correctly included in the result — they're part of the host's real pipeline.
- Mic constraints are the host's responsibility. The component only accepts host-provided streams;
  it never calls `getUserMedia()`. Hosts with specific needs (sample rate, gain, channelCount)
  create and pass their own stream.

## Review priorities

- Do not change the MLS/cross-correlation algorithm unless explicitly asked.
- Do not touch `worker.js` correlation logic during Phase 1 or Phase 2.
- Phase 1 target: `test.js` refactor only — instance-based, no DOM/recording changes.
- Phase 2 target: Custom Element wrapper only — no recording architecture changes.
- Phase 3 (AudioWorklet) must not begin before Phase 2 is stable and in-browser tested.
- Docs must keep a strict separation between implemented behavior and planned/draft API.
- `package.json` distribution fields (`exports`, `module`, `main`, `files`) are set in Phase 5. Publishing to npm is Phase 7.

## Known risks

- Unit tests cover MLS generation and cross-correlation (`npm test`); browser integration correctness still depends on manual testing across Chrome, Firefox, Safari, and mobile.
- CSP with `blob:` URLs: workers and AudioWorklet processors loaded via Blob require
  `worker-src 'self' blob:` and `script-src 'self' blob:` in the Content-Security-Policy header.
- AudioContext autoplay policy: `start()` must be called from a user gesture (click, touchstart).
- Custom element registration: loading the bundle twice can cause `customElements.define()` to
  throw if the registration guard (`customElements.get()`) is somehow bypassed.
