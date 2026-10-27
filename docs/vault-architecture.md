# Obsidian Vault Architecture & Cross-Computer Continuity

Unlike standalone learning apps that lock your history in opaque JSONL databases, our harness stores all durable knowledge as **plain, human-readable Markdown files** inside your Obsidian vault.

---

## 1. Directory Layout in Your Obsidian Vault

```text
your-obsidian-vault/
├── LEARNER.md               # Persistent learner profile: active topics, node checklists, dislodged misconceptions
├── INDEX.md                 # Master index of compiled concept notes by domain
├── concepts/                # Karpathy-style atomic wiki notes (e.g. electricity-basics.md)
├── sessions/                # Live session transcripts mirrored by md-log (e.g. electricity-basics.md)
├── flashcards/              # Spaced Repetition decks by domain (e.g. physics.md, dotnet.md)
├── vocab/                   # Atomic multilingual vocabulary notes (vocab/en/, vocab/uk/, vocab/de/)
├── viz/                     # Verified PNG diagrams (viz-*.png) and interactive HTML demos (demo-*.html)
└── raw/
    └── curated-sources.md   # Saved reading links (automatically checked in Phase 0 and pruned in Phase 4)
```

---

## 2. How Each File Works

### `LEARNER.md` — Your Epistemic Ledger
Updated every time you run `/distill`, `/feynman`, `/practice`, or `/review-vault`. It records:
- **In-Progress Topics & Node Checklists:** Which nodes (`[x]`) are locked in and which node (`[ ]`) is next.
- **Mastered Foundations:** Core truths you hold solidly (so future sessions skip re-probing them and use them as analogies).
- **Dislodged Misconceptions & Historical Traps:** Specific wrong mental models caught during probing, teaching, or practice — prioritized automatically during `/review-vault` and `/practice`.

### `concepts/<english-slug>.md` — Atomic Wiki Notes (Karpathy Pattern)
Raw chat transcripts in `sessions/` are great while learning live, but noisy to review months later. `/distill` compiles each topic into a clean reference note in `concepts/` containing:
1. **Unconditional Truths (Roots)**
2. **Mermaid Dependency DAG**
3. **Core Mental Model & Derivations** (with embedded `![[viz-...png]]` schematics, `<iframe src="viz/demo-...html">` interactive simulations, and `[[wikilinks]]` to related notes)
4. **Corrected Misconceptions**

### `flashcards/<domain>.md` — Spaced Repetition
Formatted natively for the [Obsidian Spaced Repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition) plugin (`#flashcards/<domain>`, `Question :: Answer`, or multi-line `?` cards) targeting only the highest-leverage unconditional truths and misconceptions.

### `vocab/<lang>/<word>.md` — Multilingual Vocabulary Capture (`/vocab`)
Running `/vocab <word-or-phrase>` creates an atomic vocabulary note with YAML frontmatter (indexed via Dataview in `vocab/INDEX.md`), etymology/root memory hooks, collocations, and two spaced-repetition cards (recognition + active-recall cloze).

---

## 3. Bilingual Continuity (English ↔ Ukrainian)

You can switch languages across sessions without ever fragmenting your vault:
- **Language Match:** Ask in Ukrainian (`/learn основи електрики`) and `pi` teaches, quizzes, and runs Feynman checks in Ukrainian while including standard English technical terms in parentheses on first mention (*напруга (voltage)*).
- **Canonical English Slugs:** All file paths (`concepts/electricity-basics.md`, `sessions/electricity-basics.md`) and `[[wikilinks]]` use canonical English kebab-case slugs so your Obsidian graph never splits into duplicate English/Ukrainian files.

---

## 4. Pausing & Resuming Across Days or Computers

1. **Before closing for the day:** If the status bar shows `🧠 X nodes un-distilled`, run `/distill` so your progress is compiled into `concepts/`, `flashcards/`, and `LEARNER.md` (synced via Obsidian Git).
2. **Resuming the next day (on the same or a different PC):**
   - Open `pi` in your vault and run `/learn` (with no arguments).
   - Pick your in-progress topic from the interactive popup menu.
   - `pi` appends to `sessions/<topic>.md` below a `---` divider (preserving prior history), reads `LEARNER.md` and `concepts/<topic>.md`, gives a 2-sentence recap, and continues directly at the next `[ ]` node.
