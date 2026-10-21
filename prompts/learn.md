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
   - **If it is a new topic:**
     1. **Automatically search `raw/curated-sources.md`** (using English keywords for the topic/domain). If matching or closely adjacent links exist in `raw/curated-sources.md`, ask me via `ask_user_question` (`multiSelect: true`) which ones to use and `web_fetch` the approved ones; if none match, briefly note that and proceed.
     2. Run Phase 1 (Probe my current edge with `quiz` and clarify my goal with `ask_user_question`).
3. **Explicit Subagent Authorization (`researcher`, `mermaid-maker`, `svg-maker`):**
   - You are explicitly authorized and required to delegate to `subagent({ agent: "researcher", async: false, task: "..." })` (with `async: false` so you receive the result synchronously in the same turn) **before** presenting the Phase 2 Dependency Map on any new topic, and during Phase 3 whenever verifying exact mechanisms, formulas, dates, or technical facts.
   - You are also explicitly authorized to call `subagent({ agent: "mermaid-maker", async: false, task: "..." })` or `subagent({ agent: "svg-maker", async: false, task: "..." })` via the `visualize` skill whenever a diagram or schematic makes a node clearer.
