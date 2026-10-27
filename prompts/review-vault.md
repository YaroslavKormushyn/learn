---
description: Run an active-recall & spaced-repetition review session from your vault
argument-hint: "[topic-or-domain]"
---
Run an **Active Recall & Weakness Review** session targeting: ${@:-my recent topics and weak spots}.

1. Read `LEARNER.md`, `INDEX.md`, `concepts/`, and `flashcards/` in the vault.
2. Prioritize:
   - Previously recorded misconceptions in `LEARNER.md`
   - Concepts learned in past sessions that need retrieval practice
3. Test me one question at a time mixing:
   - Diagnostic `quiz` questions (with believable distractors based on my past misconceptions; read my `confidence` and `thinking / note` alongside correctness)
   - Code/system prediction questions (`quiz` or `explain` with `type: "predict"`)
   - Pre-committed free-recall explanations (`explain({ type: "check", question: "...", committedAnswer: "..." })`)
4. After 3–5 questions, update `LEARNER.md` with my retention results.
