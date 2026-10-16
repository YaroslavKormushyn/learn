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
- `prompts/` — Slash commands: `/learn`, `/feynman`, `/distill`, `/review-vault`
- `extensions/quiz.ts` & `extensions/ask-user-question.ts` — Interactive terminal UI popups for graded quizzes and questions
- `extensions/md-log.ts` — Mirrors live sessions to Obsidian (auto-creates files) and tracks un-distilled progress in the status bar
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

## Slash Commands

| Command | Description |
|---|---|
| `/md-log sessions/<topic>.md` | Mirror live Q&A, quizzes, and diagrams to an Obsidian note (auto-creates file) |
| `/learn <topic>` | Start or resume a structured learning session using your `LEARNER.md` profile |
| `/feynman [topic]` | Role-reversal teach-back: explain the concept in your own words to expose blind spots |
| `/distill [topic-slug]` | Compile the session into `concepts/<topic>.md`, `flashcards/`, and `LEARNER.md` |
| `/review-vault [topic]` | Active-recall & misconception review session across your vault |
