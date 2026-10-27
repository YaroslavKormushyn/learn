# Teaching Methodology

Our `teach` skill (`skills/teach/SKILL.md`) is built on a simple epistemic goal: **memorized facts rot; understood facts don't.** The terminal condition of a learning session is not that you can recite a definition — it is that the **goal understanding feels obviously true** because you can see how it derives from foundations you already hold.

---

## 1. The Two Core Principles

### Principle i — Unconditional Truths First (Building the Nodes)
The human brain refuses to fully commit to a fact if it suspects some deeper caveat might later contradict it ("the hedge"). To eliminate hedging:
- We start every dependency tree from **unconditional truths** — facts or real definitions simple enough to accept **as-is, at face value, with zero caveats**.
- Whenever a domain has an atomic universal statement (*"ALL X is done through {Y}"*, e.g. *"ALL communication between computers is done through {sending packets}"*), we surface it first and confirm it feels rock-solid before building anything on top.

### Principle ii — "How Could I Have Discovered This?" (Building the Edges)
Facts feel arbitrary when they are handed down as decrees. Following Grant Sanderson's (3Blue1Brown) philosophy:
- Every intermediate step must be **motivated** by a problem or failure of the previous state.
- Instead of saying *"Here is formula X,"* the tutor shows what breaks without X and walks through how you could have invented X yourself.
- The moment a pile of loose facts collapses into a few generating truths is **the click**.

---

## 2. High-Entry Binary Search Probing & Strand Assessment

Before planning a lesson, Phase 1 brackets your knowledge frontier along every prerequisite strand the lesson depends on:
- **Enter Near the Top:** Instead of wasting time on elementary warm-up questions, the prober opens near the hardest prerequisite the goal requires and lets a miss walk it down.
- **Bracket Both Floor and Ceiling:** A strand is only mapped when the prober has found both something you reliably hold (**Floor**) and where your understanding runs out (**Ceiling**).
- **Strand Assessment Table:** Phase 1 concludes by printing a concrete diagnostic table (`Strand | Floor | Ceiling | Misconceptions`) into your Obsidian session log, which becomes the specification for the Phase 2 Dependency Map.

---

## 3. Confidence × Correctness Diagnostic Matrix

Every `quiz` popup lets you set your confidence (`30% | 50% | 70% | 90% | 100%`) via `←`/`→` and write your reasoning in the **Thinking** field. The tutor reads confidence against correctness:

| Outcome | Confidence | Diagnostic Meaning | Tutor Action |
| :--- | :--- | :--- | :--- |
| **Correct ✓** | **90–100%** | **Solid mastery** | Jump difficulty up sharply (in Probe) or advance immediately (in Teach). |
| **Correct ✓** | **30–50%** | **Fragile / lucky guess** | Reinforce the underlying mechanism before building on top of it. |
| **Wrong ✗** | **90–100%** | **Committed misconception** | Highest-priority signal. Name the exact flaw in the mental model and dislodge it immediately. |
| **Wrong ✗** | **30–50%** | **Honest gap / near-miss** | Provide a clean, brief derivation. |
| **I don't know** | — | **Clean knowledge gap** | Never treated as a wrong guess; teaches from the foundation up. |

---

## 4. "The Plan is the Landscape; Teaching is the Road"

- **Plan Nodes vs. Reasoning Steps:** The Mermaid DAG presented in Phase 2 is a coarse map of landmarks. During Phase 3, a single plan node may take 1 to 5 fine-grained **reasoning steps** — each checked individually.
- **Zero Meta-Choreography:** The tutor is explicitly forbidden from narrating its own scaffolding (*"Now I will motivate Node 2, then establish it..."*) or offering empty praise (*"Great question! Spot on!"*). Every sentence installs understanding.
- **The `Predict → Teach → Check` Cycle:**
  1. **`Predict` (`type: "predict"`):** Point at the friction/problem of the current state and let you predict what has to happen next.
  2. **`Teach`:** Resolve your prediction in clear prose, supported by verified diagrams (`mermaid-maker`, `svg-maker`), interactive simulations (`demo-maker`), or real-world photos (`search_wikimedia_images`).
  3. **`Check` (`type: "check"`):** Verify the step landed via an applied `quiz` or a pre-committed `explain` free-recall prompt.
