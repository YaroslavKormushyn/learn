---
description: Start or resume a structured learning session (interactive topic picker if no topic given; auto-links sessions/<slug>.md)
argument-hint: "[topic]"
---
Load the `teach` skill (`C:/Users/Personal/.pi/agent/skills/teach/SKILL.md`).

User's requested topic / instructions: ${@:-NONE}

1. **Phase 0 (Load Vault Context & Resolve Topic):**
   - Read `LEARNER.md` and `INDEX.md` (and check `sessions/` and `concepts/`).
   - **Case A — No topic was provided (`User's requested topic / instructions` is `NONE`):**
     - Call `ask_user_question` to let me choose whether to **resume one of my active/recent topics** (list each in-progress topic from `LEARNER.md` / `INDEX.md` / `sessions/` as an option, showing its next uncompleted node in `description`) OR choose **Other** to type a brand-new topic.
   - **Case B — A topic/instruction WAS provided above (not `NONE`):**
     - **DO NOT** ask me which topic I want to learn or show the resume picker menu! Use the exact topic and instructions I provided above.
   - **Auto-Link Session Log:**
     - Resolve the canonical English kebab-case slug for the chosen/provided topic (e.g., `how-welding-works`, `electricity-basics`).
     - **Immediately call `link_session_log({ topic_slug: "<canonical-slug>" })`** so our live session mirrors to `sessions/<canonical-slug>.md` automatically (preserving any prior transcript).
2. **Execute the Flow:**
   - **If the topic matches an existing in-progress topic in `LEARNER.md` / `concepts/`:** Read `concepts/<canonical-slug>.md` (and the tail of `sessions/<canonical-slug>.md`), give a 2–3 sentence recap of what nodes are already locked in, and proceed directly to teaching the next uncompleted `[ ]` node in Phase 3.
   - **If it is a new topic:** Follow any custom instructions I included above (such as checking `raw/curated-sources.md` and confirming sources with me), and run Phase 1 (Probe my current edge with `quiz` and clarify my goal with `ask_user_question`).
