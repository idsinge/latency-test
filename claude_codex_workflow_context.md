# Claude Code + Codex Workflow

Date: 2026-05-04
Repo: https://github.com/idsinge/latency-test
Working branch: `webcomponent`

## Goal

Use **Claude Code as a teacher and pair programmer** while migrating an
existing browser-based round-trip audio latency app into a reusable Web
Component package (`@hi-audio/latency-test`).

Use **Codex (via the Claude Code Codex plugin)** as an independent adversarial
reviewer. Claude teaches and implements. Codex challenges and reviews.
The developer decides what to accept.

This document covers workflow, setup, and portability only.
For project architecture and migration plan see `CLAUDE.md`, `AGENTS.md`,
and `CLAUDE_REVIEW.md`.

---

## New machine setup

Follow these steps on every machine before starting work on this repo.

### Prerequisites

Make sure the following are installed before continuing:

- **Git**
- **Node.js** (see `.nvmrc` for the pinned version — run `nvm use` after cloning)
- **npm**
- **VS Code**
- **Claude Code** — VS Code extension or desktop app: https://claude.ai/code

### 1. Install the Codex plugin for Claude Code

In VS Code:
- Open the Extensions panel (`Cmd+Shift+X`)
- Search for **OpenAI Codex** and install the plugin
- Reload VS Code after installation

### 2. Install the Codex CLI globally

```bash
sudo npm install -g @openai/codex
```

If you prefer to avoid `sudo`, use a user-writable npm prefix:

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
npm install -g @openai/codex
```

### 3. Authenticate

Open Claude Code in VS Code and run:

```
/codex:setup
```

If not yet logged in, authenticate with your ChatGPT account (the same
account used on other machines). Authentication is stored locally per
machine — it does not travel with the repo.

### 4. Clone the repo and install dependencies

```bash
git clone https://github.com/idsinge/latency-test.git
cd latency-test
git checkout webcomponent
npm install
```

### 5. Smoke test the build

```bash
npm run build
npm run docs:build
```

Both should complete without errors. If they fail, check Node version (`nvm use`).

Note: `node_modules/`, `dist/`, `.parcel-cache/`, and `docs/.vitepress/cache/`
are never committed. They must be rebuilt locally on every machine.

### 6. Verify the agents

```
/codex:setup
```

Should show `ready: true`. Then run a read-only portability check before
asking Codex to touch anything:

```
/codex:rescue --fresh --background Read AGENTS.md and CLAUDE.md.
Summarise the current migration phase, the next pending task, and the top 3 risks.
Do not edit files.
```

This re-orients Codex to the current repo state on the new machine.

---

## Cross-machine portability

**The repo is the context.** All project knowledge lives in committed files:

| File | What it provides |
|------|-----------------|
| `AGENTS.md` | Agent roles, migration phases, resolved decisions, review priorities |
| `CLAUDE.md` | Architecture, file map, data flow, browser notes — read automatically by Claude Code |
| `CLAUDE_REVIEW.md` | Full migration plan (Phases 1–7), packaging checklist |
| `CODEX_REVIEW.md` | Adversarial review log, open questions, architecture risks |
| `CODEX_README.md` | README and documentation strategy |

**What does NOT travel between machines:**

| Thing | Where it lives |
|-------|---------------|
| Codex CLI (`@openai/codex`) | Global npm — reinstall per machine |
| Codex plugin for VS Code | VS Code extensions — reinstall per machine |
| Codex / Claude authentication | Local account credentials — re-authenticate per machine |
| Claude Code memory files (`~/.claude/projects/...`) | Local only — never in git |

**Consequence:** never rely on Claude's session memory for project decisions.
If something is decided, it belongs in `AGENTS.md` or `CLAUDE_REVIEW.md`,
not in a memory file that only exists on one machine.

**Recommended file reading order on a new machine:**
`AGENTS.md` → `CLAUDE.md` → `CLAUDE_REVIEW.md` → `CODEX_REVIEW.md` → `CODEX_README.md` → `package.json`

---

## Reusing this methodology in another repo

The dual-agent pair-programming approach used here is generic and can be
transplanted to any repo. Replace the project-specific parts and keep the rest.

### Generic parts — reuse by default

- Claude teaches, explains tradeoffs, and implements only after explicit approval.
- Codex reviews independently and adversarially.
- For non-trivial proposals, Claude triggers Codex before presenting to the user.
- The developer types code themselves; Claude does not provide paste-ready blocks.
- Manual review loop beats automatic review gate while learning.
- User decides what to accept.
- Durable decisions belong in committed repo files, not local Claude/Codex memory.

### Project-specific parts — replace per repo

- Repo URL, clone URL, and branch names
- Package name and npm scope
- Tech stack, build commands, and smoke-test commands
- Migration phases and risk list
- Source-of-truth filenames (`AGENTS.md`, `CLAUDE.md`, etc. — rename as needed)
- Approval/editing policy (this repo requires explicit confirmation before any
  file change; other repos may use different permission settings)
- Local setup details: Node version, package manager, plugin availability

### How to reuse

1. Copy `claude_codex_workflow_context.md` and `AGENTS.md` to the new repo.
2. Update all project-specific sections.
3. Create equivalent context files (`CLAUDE.md` or equivalent) for the new project.
4. Run `/codex:setup` on the new machine to verify the plugin is ready.
5. Run a read-only `/codex:rescue --fresh` onboarding task to orient Codex.

---

## Project-level Claude Code settings

A `.claude/settings.json` file in the repo root configures Claude Code
consistently across machines (permission allowlists, hooks, etc.).
This file travels with git and applies automatically on any machine.

---

## Agent roles

### Claude Code — teacher and pair programmer

Claude helps the developer understand Web Components, JavaScript architecture,
Web Audio API, browser APIs, testing, packaging, and docs — by teaching
the reasoning behind each decision, not just implementing it.

Claude asks the developer to reason about important decisions before
revealing the answer. The goal is learning, not just shipping.

**Before editing any file, Claude must:**
1. Explain the problem
2. Explain possible approaches
3. Recommend the smallest safe next step
4. Wait for explicit user approval

**After Codex reviews something, Claude must:**
1. Classify findings by severity
2. Explain which findings matter now
3. Explain which can wait
4. Propose the smallest safe patch
5. Teach the underlying engineering principle

### Codex — independent adversarial reviewer

Codex reviews diffs and branch changes, challenges migration approach,
architecture, API design, browser compatibility, packaging, docs accuracy,
and implementation risks. Returns prioritised findings. Does not rewrite
unless explicitly asked.

### Claude invoking Codex directly

Claude can trigger Codex without the developer typing a slash command.
Claude uses the same internal mechanism (`Agent` tool) that it uses for
git commands and file operations.

Claude should proactively invoke Codex when:
- It wants a second opinion on an architectural decision
- It wants to challenge its own recommendation before presenting it
- A design question has genuine tradeoffs and an independent view adds value
- It wants to verify that a teaching explanation is technically accurate

When Claude does this, it will say so explicitly and share both its own
view and Codex's response so the developer sees the full reasoning.

**Do not enable the review gate:**
`/codex:setup --enable-review-gate` creates automatic Claude/Codex loops
that interrupt the learning flow. Keep reviews manual and intentional.

---

## Codex commands

| Command | When to use |
|---------|-------------|
| `/codex:rescue --fresh --background <task>` | New machine onboarding, investigation, read-only analysis |
| `/codex:review --background` | Review current diff or uncommitted changes |
| `/codex:adversarial-review --background <focus>` | Challenge architecture, API design, browser compatibility, over-engineering |
| `/codex:status` | Check status of a background task |
| `/codex:result` | Retrieve output of a completed task |

---

## Day-to-day loop

1. Ask Claude to explain and plan a small step
2. Claude implements only that step (after explaining and getting approval)
3. Run local checks: `npm run build`, `npm run docs:build`, `git diff`
4. Run `/codex:review` or `/codex:adversarial-review` — or Claude triggers it directly
5. Claude classifies Codex findings and proposes the smallest safe patch
6. Developer decides what to accept
7. Commit. Repeat.
