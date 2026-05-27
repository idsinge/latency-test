# Dual-Agent Pair Programming Methodology

> **Status: draft.** Extrapolated from one project. Covers the scenarios encountered
> there. Gaps and untested cases are expected — contribute refinements as you find them.

---

## What this is

A framework for learning-focused software development using two AI agents:

- **Claude** — teacher and pair programmer. Explains the *why*, works in small steps,
  waits for your approval before touching files.
- **Codex** — independent adversarial reviewer. Challenges proposals, finds risks,
  returns prioritised findings. Does not rewrite unless asked. Its output is
  **advisory** — Claude classifies the findings, you decide what to act on.
- **You** — decision-maker. You approve what gets built and, depending on your chosen
  mode, you type the code yourself.

This document is a template. Answer the onboarding questions below once per project.
Your answers become the shared context both agents use throughout the work.

---

## Onboarding questions

Answer these before your first session. Add your answers directly below each question.
The more specific, the more useful both agents will be.

### About you

**Q1. What is your programming experience level overall?**
*(e.g. beginner, some experience with one language, professional developer)*

> *Your answer:*

**Q2. Which programming languages or frameworks are you comfortable with?
Which are new to you in this project?**

> *Your answer:*

**Q3. Are you familiar with Git and remote repositories (e.g. GitHub)?**
*(If not or partially, say so — Claude will include Git guidance: creating branches,
committing, pushing, reviewing diffs, and working with remotes)*

> *Your answer:*

**Q4. What is the current state of your repository?**
- Is the project under version control (Git)?
- Is there a dedicated branch for this work, or will you be working on the main branch?
- Is the working tree clean (no uncommitted changes that must be preserved)?

> *Your answer:*

### About the project

**Q5. What are you building, migrating, or fixing? One short paragraph.**

> *Your answer:*

**Q6. What is the current state of the codebase?**
*(Greenfield / existing prototype / production code — language, framework, rough size)*

> *Your answer:*

**Q7. What is the end goal?**
*(Shipped feature, refactored module, npm package, deployed app, etc.)*

> *Your answer:*

**Q8. What are the three biggest risks or unknowns in this project?**

> *Your answer:*

**Q9. What are the do-not-touch areas, compatibility requirements, or constraints?**
*(e.g. public API that must not break, minimum browser support, a module Claude should
never modify, performance or security requirements)*

> *Your answer:*

**Q10. What are the project's key commands?**
*(Install, dev server, build, test, lint, docs — whatever applies. If unknown, say so)*

> *Your answer:*

### About the workflow

**Q11. How strictly do you want Claude to wait for approval before writing code?**

- [ ] **Strict** — Claude explains and teaches; you type all code yourself.
      Claude must get explicit approval before modifying each file.
      Goal: learning by doing.
- [ ] **Moderate** — Claude can write code after you explicitly approve each task or
      file group. Claude still explains before acting.
      Goal: move faster while understanding each step.
- [ ] **Relaxed** — Claude can make changes within a stated scope without per-change
      approval. Claude still asks before destructive actions (deleting files,
      force-pushing, dropping data).
      Goal: ship, with teaching on request.

> *Your answer:*

**Q12. For non-trivial proposals, should Claude always check with Codex first,
or use its own judgment?**

- [ ] **Always check** — Claude invokes Codex before presenting any architectural
      or API-level proposal. You always see both views.
- [ ] **Judgment** — Claude involves Codex for architecture/API decisions and
      handles small mechanical steps alone.

> *Your answer:*

---

## Agent roles

### Claude — teacher and pair programmer

Claude helps you understand the reasoning behind every decision, not just the code.

**Before editing any file, Claude must:**

1. Explain the problem
2. Explain possible approaches and tradeoffs
3. Recommend the smallest safe next step
4. Wait for explicit user approval

**After Codex reviews something, Claude must:**

1. Classify findings by severity: fix now / can wait / informational
2. Explain which findings matter for the current phase
3. Explain which can wait and why
4. Propose the smallest safe patch
5. Teach the underlying engineering principle behind each important finding

**Claude should proactively invoke Codex when:**
- It wants a second opinion before presenting a non-trivial proposal (Q12)
- A decision has genuine tradeoffs and an independent view adds value
- It wants to challenge its own recommendation
- It wants to verify that a teaching explanation is technically accurate

When Claude does this, it says so explicitly and shares both views so you
see the full reasoning.

### Codex — independent adversarial reviewer

Codex reviews diffs and proposals. It challenges migration approach, architecture,
API design, compatibility, packaging, docs accuracy, and implementation risks.
Returns prioritised findings. Does not rewrite unless explicitly asked.

**Codex output is advisory.** Claude classifies the findings. You decide what to act on.

**Codex commands:**

| Command | When to use |
|---------|-------------|
| `/codex:rescue --fresh --background <task>` | Onboarding, investigation, read-only analysis |
| `/codex:review --background` | Review current diff or uncommitted changes |
| `/codex:adversarial-review --background <focus>` | Challenge architecture, API design, over-engineering |
| `/codex:status` | Check status of a background task |
| `/codex:result` | Retrieve output of a completed task |

> **Do not enable the review gate:** `/codex:setup --enable-review-gate` creates
> automatic Claude/Codex loops that interrupt the learning flow. Keep reviews
> manual and intentional unless you explicitly decide otherwise.

---

## Setup — per machine

Steps 1–4 are the Codex integration setup and are the same for every project.
Steps 5–7 are project-specific — fill them in from Q10.

> **Note on steps 1–4:** These cover the Codex plugin for Claude Code as it exists
> at the time of writing. Plugin URLs, CLI package names, and auth flows may change —
> verify against current docs if anything fails.

### 1. Prerequisites

Install before anything else:

- **Git** — version control. If you are new to Git, say so in Q3 — Claude will
  guide you through branching, committing, and working with remotes as part of
  the teaching loop.
- **Node.js** — check the project's `.nvmrc` for the pinned version; run `nvm use`
  after cloning if the file exists.
- **npm** — comes with Node.js.
- **VS Code** — editor.
- **Claude Code** — VS Code extension or desktop app: https://claude.ai/code

### 2. Install the Codex plugin for Claude Code

Inside the Claude Code VS Code extension:
- Type `/plugins` to open the plugin manager
- Paste the plugin URL: `https://github.com/openai/codex-plugin-cc`
- Click **Install**

No separate VS Code Codex extension is needed. Everything runs through
Claude Code and the npm package below.

### 3. Install the Codex CLI

```bash
sudo npm install -g @openai/codex
```

### 4. Authenticate and fix the Bash permission wall

Run `/codex:setup` inside Claude Code.

A successful setup shows `ready: true` with your email confirmed under `auth`.
If `loggedIn` is false, run `codex login` in a terminal and re-run `/codex:setup`.

Authentication is stored locally — it does not travel with the repo.

> **⚠ Bash permission wall:** Background Codex subagents need Bash tool access to
> call the companion script. In some Claude Code permission modes, Bash calls from
> background subagents are auto-denied without prompting — Codex fails silently
> and Claude falls back to answering directly.
>
> Fix: add `.claude/settings.json` to the repo root with this content and commit it.
> The glob pattern works on any machine — no absolute paths needed.
>
> ```json
> {
>   "permissions": {
>     "allow": ["Bash(node *codex-companion.mjs*)"]
>   }
> }
> ```
>
> This file travels with git and applies on every machine automatically.
> Create it once; all collaborators benefit.

### 5. Clone the repo and install dependencies

```bash
git clone <repo-url>
cd <repo-name>
nvm use         # if .nvmrc is present
<install command from Q10>
```

### 6. Smoke test the build

Run the build and test commands from Q10. Record the baseline state — if the
build is already broken, that is the baseline to fix before starting, not a
sign that setup failed.

### 7. Orient Codex to the current state

```
/codex:rescue --fresh --background Read <your context files — e.g. CLAUDE.md, this file>.
Summarise the current phase, the next pending task, and the top 3 risks.
Do not edit files.
```

Adjust the file list to whatever serves as project context in your repo.
Run this on every new machine and after any long gap between sessions.

---

## Day-to-day loop

1. Ask Claude to explain and plan the next small step
2. For non-trivial proposals (per Q12), Claude invokes Codex before presenting —
   you see both views
3. You approve, redirect, or ask for more explanation
4. You type the code or approve Claude to write it (per your mode in Q11)
5. Run local checks: build, tests, lint — the commands from Q10
6. **Inspect the diff before committing:** run `git diff` or review the staged
   changes. Verify only the intended files changed. This is a safety habit, not
   optional.
7. Run `/codex:review --background` to review the implementation, or let Claude
   trigger it
8. Claude classifies Codex findings and proposes the smallest safe patch
9. You decide what to accept
10. Commit. Repeat.

---

## Project configuration

*Fill these in once agreed. Do not re-open without good reason.*

### Current phase and task

| Field | Value |
|-------|-------|
| Current phase | ... |
| Current task | ... |
| Last completed | ... |

### Tech stack

> *(from Q6)*

### Key commands

> *(from Q10)*

### Phases and milestones

| Phase | Goal | Status |
|-------|------|--------|
| 1 | ... | Pending |

### Resolved decisions

*Decisions made and closed — do not re-open unless explicitly raised:*

- ...

### Known risks

*(from Q8)*

- ...

### Do-not-touch areas and constraints

*(from Q9)*

- ...

### Review priorities

*What Codex should focus on. What it should leave alone.*

- ...

---

## Cross-machine portability

**The repo is the context.** All project knowledge lives in committed files.
Never rely on Claude's session memory or local notes for decisions — those
only exist on one machine.

| Does NOT travel | Where it lives |
|-----------------|----------------|
| Codex CLI (`@openai/codex`) | Global npm — reinstall per machine |
| Codex plugin for Claude Code | Install via `/plugins` — reinstall per machine |
| Codex / Claude authentication | Local credentials — re-authenticate per machine |
| Claude Code memory files | `~/.claude/projects/...` — local only, never in git |
| `.env` files and API keys | Local only — never commit secrets |
| Local databases, caches, generated artifacts | Rebuild locally from committed source |

If a decision is made, it belongs in a committed file, not in session history.

---

## Transplanting this methodology to a new repo

1. Copy this file to the new repo root
2. Answer Q1–Q12 above (delete the unanswered questions or keep them as prompts)
3. **Delete any project-specific decisions** from the resolved decisions and
   constraints sections — those belong to the repo this was copied from, not yours
4. Create a `CLAUDE.md` with project architecture, file map, and data flow —
   Claude Code reads this automatically
5. Create `.claude/settings.json` with the Codex Bash allowlist (see Setup step 4)
6. Run `/codex:setup` to verify Codex is ready
7. Run the read-only Codex onboarding task (Setup step 7) to orient Codex

### Generic parts — keep as-is for most projects

- Claude teaches before implementing
- Codex reviews independently and its output is advisory
- Claude invokes Codex proactively for non-trivial proposals
- Manual review loop; no automatic review gate
- Committed files are the single source of truth
- Inspect the diff before every commit

### Project-specific parts — replace per repo

- Repo URL, branch names, clone command
- Package name and scope
- Tech stack, build/test/lint commands (Q10)
- Migration phases and risk list
- Approval mode (Q11) and Codex involvement level (Q12)
- Git guidance depth — depends on Q3 and Q4
- Do-not-touch areas and constraints (Q9)
