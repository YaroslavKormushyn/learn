# Interactive Tools & Verifying Subagents

Our learning harness extends `pi` with custom TUI interaction tools (`extensions/*.ts`) and specialized verifying subagents (`agents/*.md`).

---

## 1. Interactive TUI Tools

### `quiz` — Graded Multiple-Choice & Multi-Select (`extensions/quiz.ts`)
- **CoT Schema Ordering:** In the tool schema, `explanation` is required *before* `correctAnswer` so the LLM reasons out why the answer holds before committing to the option key.
- **Anti-Leak Option Schema:** Options have no `description` sub-field, preventing models from leaking hints inside option sub-labels.
- **Confidence Selector (`←` / `→`):** Press `←` or `→` while selecting an option to set your confidence (`30% | 50% | 70% | 90% | 100%`).
- **Thinking Out Loud (`Tab` or `↓`):** Attach your reasoning or a side question to any answer.
- **Ask First (Pause Quiz):** Select *"Ask a question first (pause quiz)"* to ask a clarifying question without spoiling the correct answer.
- **Terminal Math Rendering:** Automatically converts inline `$...$` and display `$$...$$` LaTeX into crisp Unicode symbols (`√`, `∫`, `Δ`, superscripts/subscripts, fractions) inside the terminal while writing raw LaTeX into your Obsidian session log.

### `explain` — Pre-Committed Free-Recall, Feynman & Practice Tool (`extensions/quiz.ts`)
- **Structural Anti-Sycophancy:** When the AI asks an open-ended question without pre-committing an answer, LLMs tend to flatter vague user responses ("Great explanation!"). `explain` requires the AI to commit its complete `committedAnswer` in the tool call *before* you type a word.
- **Four Learner Actions:**
  1. `✓ Submit answer & reveal reference solution` — Reveals the AI's pre-committed answer in the terminal feedback view and sends both to the AI for strict grading (`🔴 / 🟡 / 🟢`).
  2. `💡 I'm stuck / Check my work so far` — Sends your partial working trace with `requestedHint: true` **without** revealing `committedAnswer`, prompting a single `R0`–`R5` Hint Ladder nudge.
  3. `💬 Ask a clarifying question first` — Pauses the prompt with `askFirst: true` **without** spoiling `committedAnswer`.
  4. `○ I don't know` — Marks a clean knowledge gap and reveals the reference solution.

### `ask_user_question` — Ungraded Preferences & Checkpoints (`extensions/ask-user-question.ts`)
- Used for decisions with no right/wrong answer: picking an active topic to resume, selecting curated articles from `raw/curated-sources.md`, clarifying your learning goal in Phase 1b, or choosing milestone checkpoints.

### `link_session_log` — Automatic Obsidian Session Mirroring (`extensions/md-log.ts`)
- Automatically links the live session to `sessions/<canonical-english-slug>.md` (preserving any prior transcript across days or computers behind a `---` divider) and tracks un-distilled checkpoints (`🧠 X nodes un-distilled`) in the terminal status bar.

---

## 2. Synchronous Verifying Subagents (`agents/*.md`)

To keep the main tutor's context window clean and prevent unverified one-shot errors, heavy research, diagramming, interactive coding, and PDF reading are delegated synchronously (`async: false`) to specialist subagents:

| Subagent | Tools | What It Does & How It Verifies |
| :--- | :--- | :--- |
| **`researcher`** | `web_search`, `web_fetch`, `search_wikimedia_images` | Breaks a technical question into facets, searches primary sources, fetches full pages, and returns a cited brief before the tutor plans or teaches. |
| **`mermaid-maker`** | `write_mermaid`, `edit_mermaid`, `render_mermaid` | Authors a Mermaid diagram, renders it to PNG via `@mermaid-js/mermaid-cli` + headless Chrome, **visually inspects the PNG**, iterates until clean, and publishes `viz/viz-<slug>-<ts>.png`. |
| **`svg-maker`** | `write_svg`, `edit_svg`, `render_svg` | Hand-authors an SVG schematic/cross-section, renders it to PNG via headless Chrome, **visually inspects coordinates/labels**, and publishes `viz/viz-<slug>-<ts>.png`. |
| **`demo-maker`** | `write_demo`, `edit_demo`, `render_demo` | Builds a self-contained HTML/JS/Canvas interactive simulation, executes it in headless Chrome to verify **0 console errors & 0 page errors**, **visually inspects a PNG screenshot**, and publishes `viz/demo-<slug>-<ts>.html` (embedded via `<iframe>` in Obsidian). |
| **`pdf-reader`** | `pdf_info`, `pdf_search`, `pdf_extract`, `pdf_render` | Triages a local PDF by page count, text length, image count, and math density; searches/extracts text and **visually renders equation- or diagram-heavy pages to PNG** so it reads math with its eyes, returning a brief with `(p. N)` citations. |
