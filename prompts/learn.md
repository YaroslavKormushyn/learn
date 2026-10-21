---
description: Start or resume a structured learning session (interactive topic picker if no topic given; auto-links sessions/<slug>.md)
argument-hint: "[topic]"
---
Load the `teach` skill (`C:/Users/Personal/.pi/agent/skills/teach/SKILL.md`).

Requested topic argument: `${@}`

1. **Phase 0 (Load Vault Context & Select/Resolve Topic):**
   - Read `LEARNER.md` and `INDEX.md` (and check `sessions/` and `concepts/`).
   - **If no topic argument was provided (`${@}` is empty):**
     - Call `ask_user_question` to let me choose whether to **resume one of my active/recent topics** (list each in-progress topic from `LEARNER.md` / `INDEX.md` / `sessions/` as an option, showing its next uncompleted node in `description`) OR choose **Other** to type a brand-new topic.
   - **Once the topic is chosen or provided:**
     - Resolve its canonical English kebab-case slug (matching existing topics semantically across English and Ukrainian).
     - **Immediately call `link_session_log({ topic_slug: "<canonical-slug>" })`** so our live session mirrors to `sessions/<canonical-slug>.md` automatically (preserving any prior transcript from earlier days or other computers).
2. **Resume vs. New Topic Flow:**
   - **If resuming an existing in-progress topic:** Read `concepts/<canonical-slug>.md` (and the tail of `sessions/<canonical-slug>.md`), give a 2–3 sentence recap of what nodes are already locked in, and proceed directly to teaching the next uncompleted `[ ]` node in Phase 3 (or ask in what language—EN or UK—to continue if ambiguous).
   - **If starting a new topic:** Check `raw/curated-sources.md` for relevant saved links, then run Phase 1 (Probe my current edge with `quiz` and clarify my goal with `ask_user_question`).
