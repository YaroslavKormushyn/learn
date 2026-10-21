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
- *(Optional)* In Obsidian Community Plugins, install **Spaced Repetition** (`st3v3nmw/obsidian-spaced-repetition`) and **Dataview**:
  - In **Settings → Spaced Repetition → Flashcards**, set:
    - **Show context in cards:** `OFF` *(prevents note titles from spoiling vocabulary cloze cards)*
    - **Bury sibling cards until the next day:** `ON`
    - **Convert highlights to clozes:** `ON`

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
/learn
```
*(Or `/learn <topic>` to start a specific topic directly. `pi` automatically links `sessions/<topic-slug>.md` for you!)*

## Common User Flows

### 1. Starting or Resuming Any Topic (`/learn`)
Launch `pi` from the root of your Obsidian vault and simply run:
```text
/learn
```
- **Interactive Picker:** When called with no arguments, `/learn` reads `LEARNER.md`, `INDEX.md`, and `sessions/` and pops up a menu of your **active/recent topics** (showing which node is next), plus **Other** to type a brand-new topic.
- **Auto Session Logging:** You don't need to run `/md-log` manually or remember exact filenames—as soon as you pick or enter a topic, `pi` calls `link_session_log` to link `sessions/<canonical-slug>.md` automatically (preserving any existing transcript from earlier days or other computers).

### 2. Pausing & Resuming Across Days or Different Computers

**Before closing for the day:**
1. If the status bar shows un-distilled progress (`🧠 X nodes un-distilled`), run:
   ```text
   /distill
   ```
   This saves your dependency graph and completed nodes to `concepts/<topic>.md`, appends flashcards to `flashcards/<domain>.md`, and updates your node checklist in `LEARNER.md` (which Obsidian Git syncs to GitHub automatically).
2. Exit `pi` (`Ctrl+C` or `/exit`).

**Resuming the next day (on the same OR a different computer):**
- **Option A — Cross-Computer / Fresh Context Resume (Recommended):**
  Open `pi` in your synced vault and run:
  ```text
  /learn
  ```
  Select the in-progress topic from the popup menu. `pi` automatically links `sessions/<topic>.md` (appending below a `---` divider without overwriting prior history), reads `LEARNER.md` and `concepts/<topic>.md`, gives a 2-sentence recap, and continues directly at the next `[ ]` node.
- **Option B — Same-Machine Thread Resume:**
  If you're on the same PC and want the exact same chat window, run `pi -c` (or `/resume`).

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

### 4. Capturing New Vocabulary (`/vocab`)
Whenever you encounter an unfamiliar word or phrase (in English, Ukrainian, German, etc.) during a lesson or while reading:
```text
/vocab contentious
/vocab дихотомія
/vocab "ground zero"
```
This automatically detects the language and creates a strict atomic note in `vocab/<lang>/<word>.md` with:
- **YAML Frontmatter** (`word`, `lang`, `pos`, `ipa`, `translation`, `synonyms`, `antonyms`, `domain`, `added`) indexed live in `vocab/INDEX.md` via **Dataview**.
- **Etymology / Root Memory Hook** so the word locks in by meaning rather than rote memorization.
- **Collocations & Context Examples**.
- **2 Spaced Repetition Cards** (`#flashcards/vocab/<lang>`): one recognition card (`word :: translation + hook`) and one active-recall cloze sentence (`==word;;hint==`).

## Slash Commands

| Command | Description |
|---|---|
| `/learn [topic]` | Start or resume a learning session (shows an interactive topic picker if `[topic]` is omitted, and auto-links `sessions/<slug>.md`) |
| `/md-log [topic]` | Manually link/switch the live session log in `sessions/` (shows a file picker if omitted) |
| `/feynman [topic]` | Role-reversal teach-back: explain the concept in your own words to expose blind spots |
| `/distill [topic-slug]` | Compile the session into `concepts/<topic>.md`, `flashcards/`, and `LEARNER.md` |
| `/review-vault [topic]` | Active-recall & misconception review session across your vault |
| `/vocab <word-or-phrase>` | Create/enrich an atomic word note in `vocab/<lang>/<word>.md` with etymology & flashcards |
