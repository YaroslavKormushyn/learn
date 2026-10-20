# learn

A compounding AI learning system built on [pi](https://github.com/earendil-works/pi) and [Obsidian](https://obsidian.md).

Forked from [amosblomqvist/learn](https://github.com/amosblomqvist/learn) ([video](https://www.youtube.com/watch?v=kzcI5F4tGiU)) and extended with persistent learner memory, [Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) compilation, [Feynman Role-Reversal](https://github.com/koukekoukej-glitch/feynman-tutor) teach-backs, and [Obsidian Spaced Repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition).

## How It Works

1. **Load Memory (`Phase 0`)** — Reads `LEARNER.md`, `INDEX.md`, and `concepts/` from your Obsidian vault so the tutor never starts from zero.
2. **Probe & Map (`Phase 1–2`)** — Binary-searches your knowledge edge using graded `quiz` popups and builds a first-principles Mermaid dependency graph.
3. **Teach & Challenge (`Phase 3`)** — Teaches node-by-node from unconditional truths, mixing `quiz` checks, code/system predictions, and **Feynman Teach-Backs** (graded 🔴 / 🟡 / 🟢).
4. **Nudge & Distill (`Phase 4`)** — Every 2 nodes (and in the status bar), nudges you to run a teach-back and compiles the session into clean atomic wiki notes (`concepts/`), flashcards (`flashcards/`), and updated learner memory (`LEARNER.md`).

## What's Inside

- `skills/teach/` — Full 5-phase teaching loop (Memory → Probe → Plan → Teach/Feynman → Distill)
- `skills/visualize/` & `extensions/visual-tools/` — Generates and verifies Mermaid & SVG diagrams inline in Obsidian
- `prompts/` — Slash commands: `/learn`, `/feynman`, `/distill`, `/review-vault`, `/vocab`
- `extensions/quiz.ts` & `extensions/ask-user-question.ts` — Interactive terminal UI popups for graded quizzes and questions (with automatic LaTeX-to-Unicode terminal math rendering and multi-line wrapping)
- `extensions/md-log.ts` — Mirrors live sessions to `sessions/<topic>.md` in Obsidian (auto-creates files) and tracks un-distilled progress in the status bar
- `extensions/web-tools.ts` — Native `web_search` and `web_fetch` tools for the `researcher` subagent
- `agents/` — Subagents (`researcher`, `mermaid-maker`, `svg-maker`) using your active session model

## Setup on a New Machine

### 1. Prerequisites
- Install [pi](https://github.com/earendil-works/pi) and [Obsidian](https://obsidian.md).
- *(Optional)* In Obsidian Community Plugins, install **Spaced Repetition** (`st3v3nmw/obsidian-spaced-repetition`) to review generated flashcards.

### 2. Clone into `~/.pi/agent`
```bash
# Linux / macOS / Git Bash on Windows:
git clone https://github.com/YaroslavKormushyn/learn.git ~/.pi/agent

# PowerShell on Windows:
git clone https://github.com/YaroslavKormushyn/learn.git "$HOME\.pi\agent"
```

### 3. Install Visual Tool Dependencies
```bash
cd ~/.pi/agent/extensions/visual-tools
npm install
```
*(Packages listed in `settings.json`, such as `pi-subagents`, are managed by `pi` automatically).*

### 4. Start Learning in Your Obsidian Vault
Open a terminal inside your Obsidian vault folder and launch `pi`:
```bash
cd /path/to/your/obsidian-vault
pi
```
Inside `pi`, authenticate your model provider (`/login`), then run:
```text
/md-log sessions/my-topic.md
/learn <topic>
```

## Common User Flows

### 1. Starting a New Topic
Always launch `pi` from the root of your Obsidian vault, link a session log in `sessions/`, and start `/learn`:
```text
/md-log my-topic
/learn <topic>
```
*(Note: `/md-log my-topic` automatically resolves to `sessions/my-topic.md` so your vault root stays clean).*

### 2. Pausing & Resuming the Next Day

**Before closing for the day:**
1. If the status bar shows un-distilled progress (`🧠 X nodes un-distilled`), run:
   ```text
   /distill
   ```
   This saves your dependency graph and completed nodes to `concepts/<topic>.md`, appends flashcards to `flashcards/<domain>.md`, and updates your node checklist in `LEARNER.md`.
2. Exit `pi` (`Ctrl+C` or `/exit`).

**Resuming the next day (two options):**
- **Option A — Continue the exact same chat thread (Fastest):**
  Run `pi -c` (or `/resume` inside `pi`). Your `/md-log` link is restored automatically in the status bar. Just say *"Let's continue with the next node."*
- **Option B — Start a fresh context window using Vault Memory (Best for multi-day topics):**
  Run `pi`, then:
  ```text
  /md-log <topic>
  /learn <topic>
  ```
  `Phase 0` reads `LEARNER.md` and `concepts/<topic>.md`, sees which `[x]` nodes are already mastered, and picks up directly at the next `[ ]` node on your dependency graph.

### 3. Active Recall & Reviewing Past Topics
When you want to check if your knowledge of an older topic is still sharp, you have three layers of recall:

1. **AI Diagnostic & Scenario Recall (`/review-vault`):**
   ```text
   /review-vault               # Reviews recent topics + past misconceptions from LEARNER.md
   /review-vault <topic>       # Targets a specific topic or domain (e.g., /review-vault electricity)
   ```
   Tests you one question at a time mixing diagnostic `quiz` popups (targeting your historical traps), *"What happens when..."* prediction scenarios, and short free-text explanations, then updates `LEARNER.md`.
2. **Role-Reversal Teach-Back (`/feynman`):**
   ```text
   /feynman <topic>
   ```
   Flips the roles: you explain the topic from scratch in your own words, and the AI acts as a curious student/skeptic that pokes at any hand-wavy steps and grades your mental model (🔴 / 🟡 / 🟢).
3. **Obsidian Spaced Repetition Flashcards (`flashcards/`):**
   Every `/distill` generates `#flashcards/<domain>` decks inside `flashcards/`. Click the **Review flashcards** ribbon icon in Obsidian (via the *Spaced Repetition* community plugin) for quick daily scheduling.

## Slash Commands

| Command | Description |
|---|---|
| `/md-log <topic>` | Mirror live Q&A, quizzes, and diagrams to `sessions/<topic>.md` (auto-creates file) |
| `/learn <topic>` | Start or resume a structured learning session using your `LEARNER.md` profile |
| `/feynman [topic]` | Role-reversal teach-back: explain the concept in your own words to expose blind spots |
| `/distill [topic-slug]` | Compile the session into `concepts/<topic>.md`, `flashcards/`, and `LEARNER.md` |
| `/review-vault [topic]` | Active-recall & misconception review session across your vault |
| `/vocab <word-or-phrase>` | Create/enrich an atomic word note in `vocab/<lang>/<word>.md` with etymology & flashcards |
