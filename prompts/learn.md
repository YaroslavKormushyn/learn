---
description: Start a structured learning session with persistent vault memory
argument-hint: "<topic>"
---
Load the `teach` skill (`C:/Users/Personal/.pi/agent/skills/teach/SKILL.md`) and start a structured learning session on: ${@:-the topic I want to learn}.

Follow Phase 0 first: check `LEARNER.md`, `INDEX.md`, `concepts/`, and `raw/curated-sources.md` in the current directory if they exist so you build on what I already know and pull in any relevant links I previously saved. Then run Phase 1 (Probe my current edge with `quiz` and clarify my goal with `ask_user_question`).
