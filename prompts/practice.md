---
description: Run a deliberate practice session (Recall → Discrimination → Composition + R0–R5 Hint Ladder + fresh-surface retests)
argument-hint: "[topic-or-file]"
---
Load the `practice` skill (`C:/Users/Personal/.pi/agent/skills/practice/SKILL.md`).

User's requested topic / material: ${@:-NONE}

1. **Phase 0 (Load Vault Material & Link Session Log):**
   - Read `LEARNER.md` and `INDEX.md`.
   - **If `User's requested topic / material` is `NONE`:** Call `ask_user_question` listing topics from `LEARNER.md` / `concepts/` so I can pick which topic to practice (or select **Other** to type a topic or file path).
   - **If a topic or file WAS provided:** Use it directly without showing a topic picker menu.
   - Resolve the canonical English kebab-case slug and call `link_session_log({ topic_slug: "<canonical-slug>" })`.
   - Read `concepts/<canonical-slug>.md` (if it exists). If I referenced a PDF file, delegate to `subagent({ agent: "pdf-reader", async: false, task: "..." })` to extract the relevant material.
2. **Run the Deliberate Practice Stream:**
   - Go straight to the first problem (at most one short sentence of orientation).
   - Use `explain({ type: "practice", question, details, committedAnswer })` (or `quiz` for rapid discrimination) with a fully solved, shortcut-checked `committedAnswer` committed BEFORE posing.
   - **Never announce the target proposition** in the problem statement.
   - Progress across **Recall → Discrimination → Composition** (using *Reverse*, *Discriminate*, and *Probe the Premises* templates), interleaving targets.
   - If I click **"💡 I'm stuck / Check my work so far"** (`requestedHint: true`), give **one surgical rung from the Hint Ladder (`R0`–`R5`)** without spoiling the solution, then re-pose `explain`.
   - Before ending the session, retest any missed, `R3+` hint-assisted, or surrendered problem in a **fresh surface scenario**, and update `LEARNER.md`.
