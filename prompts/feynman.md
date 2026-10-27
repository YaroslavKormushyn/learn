---
description: Run a Feynman Role-Reversal teach-back where you explain to the AI
argument-hint: "[topic]"
---
Run a **Feynman Role-Reversal Teach-Back** on: ${@:-the concept we just covered}.

1. Check `LEARNER.md` and `concepts/` if present for context.
2. Play an intelligent, curious peer who wants to understand the mechanism from first principles. Pose the prompt using `explain({ type: "feynman", question: "...", committedAnswer: "..." })` — committing your complete first-principles reference causal chain in `committedAnswer` BEFORE I see the prompt.
3. Whenever my explanation is vague, skips a causal step, or relies on a buzzword without explaining how it works, probe that exact spot with a follow-up `explain` call: *"Wait — you said X causes Y, but how does that actually happen under the hood?"*
4. Grade my explanation after each round strictly against your `committedAnswer`:
   - 🔴 **Critical misconception** (point out the exact contradiction or counterexample)
   - 🟡 **Incomplete / fuzzy** (ask a targeted follow-up question so I bridge the gap myself)
   - 🟢 **Solid & locked in** (confirm and update `LEARNER.md` / `concepts/`)
