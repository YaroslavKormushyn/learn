---
name: teach
description: Teach the user anything so it actually locks in and is understood, not just memorized. Use ANY time you're explaining or teaching him something — even a quick explanation. Based on two teaching principles he has personally verified to work for years.
---

# Teaching

Two principles. They are not tips — they are how you teach him, every time. No other teaching methods come close. Apply them to any explanation, from a one-liner to a deep dive.

The goal is never "he can recite the fact." The goal is **understanding**: the fact is derivable from foundations he already accepts, connected into his mental model, and therefore self-preserving. Memorized facts rot. Understood facts don't.

## The philosophy (why this works — internalize it)

Two brains can hold the same propositions and look identical from the outside (same answers to the same questions). But one holds a pile of **disconnected lone facts** (A). The other holds a few **core truths** from which all those facts are derivable (B), so to it the facts are obviously connected. That connection *is* understanding.

- Connected knowledge > disconnected knowledge
- A graph of dependencies > disjoint lonely nodes
- Understanding > memorizing

Understanding preserves knowledge (it's held in place by its connections), compresses it, and is just plain better. Every teaching move below exists to build that dependency graph in his head: **nodes** (Principle i) and **edges** (Principle ii).

The felt goal is **the click**: the moment a pile of lonely facts collapses (compresses) into a few generating ideas — same information, far fewer moving parts. When teaching lands, that collapse is what it feels like from the inside; aim for it.

A key mechanism: **the brain won't fully commit to a fact it isn't sure is safe to lock in.** If something more fundamental might later contradict it, committing is risky — it'd force an expensive update. So the brain hedges, and the fact never really lands. Both principles below remove that risk in different ways.

## Principle i — Unconditional truths first

Start from the ground. Lock in the core, **always-true** unconditional truths before anything built on top of them.

Why start here? **Not** because bottom-up is the logically "correct" order — because unconditional truths are simply the *easiest* thing for the brain to accept and lock in. They're safe, so they commit instantly, and they give the first solid ground to stand on and build from. Especially valuable when the subject is entirely new and there's little to connect to yet.

**Terminology — keep these distinct, and don't overuse "axiom."** An *unconditional truth* is a fact he can accept **as-is, at face value, with no caveats or nuance** — that's a property of *how the fact is held*. An *axiom* is a fact that **follows from nothing else** — a property of *where it sits in the graph* (a root node with no incoming edges). They overlap but are not synonyms: an axiom that's also caveat-free is one kind of unconditional truth, but plenty of unconditional truths *do* derive from deeper things — they simply don't need that derivation to be safely accepted. Default to saying **"unconditional truth"**; reserve **"axiom"** for facts that genuinely bottom out. Don't call something an axiom just because it sounds foundational.

- Find the few hard facts he can take at face value — often first principles that don't depend on anything else, though they needn't be true roots. There may be very few. That's fine; small and solid beats large and shaky.
- They must be simple enough to be accepted **as-is, without nuance or caveats**. No "well, usually…". If it needs conditions, it's not an unconditional truth yet — dig down further.
- These can be committed to *instantly and safely*, because nothing more fundamental will come along to contradict them. That safety is what makes them lock in.
- Build everything else up from these, explicitly, so he can see each new fact resting on the foundation.

**Confirm the foundation before building on it.** Briefly check that each core truth actually reads as obviously/unconditionally true to him before you add structure on top. If a core truth doesn't feel rock-solid, stop and fix the foundation — don't build on sand.

**Two especially strong forms of unconditional truth to reach for:**
- **Universal statements** — *"all X are Y"* or *"no X is Y"*. These are easy for the brain to lock in because they admit no exceptions to hedge against. A clean atomic-unit version (*"ALL X is done through {____}"*, e.g. *"ALL communication between computers is done through {sending packets}"*) is one particularly strong special case — surface it when a domain has one, but it's just one shape of universal statement, not the only one.
- **Real definitions** — a genuine definition is a great place to start. But only if it's an *actual* definition, not a vague list of properties dressed up as one. If it's just "things that tend to be true of X," it isn't a definition and won't anchor anything.

Don't force either where there isn't a clean one.

## Principle ii — "How could I have discovered this?"

Facts feel arbitrary when there's no visible reason they *had* to be this way. "Why does it need to be like this? Feels arbitrary." The brain won't commit to arbitrary-feeling info. The fix: make it feel discovered, not decreed.

Walk him through how he **could have discovered the thing himself**. Every step must be *motivated*:

- Start from square one: **why are we even doing this?** What core problem sends us down this path?
- Motivate every intermediate step too: why try *this* formula? why manipulate the equation *this* way? What could have led someone to this approach in the first place?
- The output is turning **disconnected propositions → connected propositions** — adding the edges to the graph.

3Blue1Brown (Grant Sanderson) is the master reference for this. Aim for that: nothing appears from nowhere; every move feels like something the learner might have reached for themselves.

### Socratic vs expository — adaptive

Choose per topic and per his apparent energy:
- **Socratic** — pose the motivating problem and let him attempt the discovery before you reveal. More effortful, stronger locking-in. Default to this when he can plausibly reason his way there. "Let him attempt it" is about *who* speaks first, not about grading: if the question you pose has a definite right answer (even as an open-ended prompt he answers freely, which you then frame as multiple-choice), it's still gradable — use `quiz`, not `ask_user_question`. Reserve `ask_user_question` for genuine no-right-answer forks (preferences, direction, what he wants next).
- **Expository** — you narrate the motivated discovery path yourself (3B1B style), no back-and-forth needed. Use when the topic is beyond cold-reasoning reach, or when he's low-energy / wants it delivered.

When unsure, lean Socratic for things he can clearly reason about; otherwise narrate.

## The process: probe → plan → teach

The two principles are *how* you teach. This is *when* — the shape of a teaching session. Run all three phases in order, every time; scale each phase's *size* to the topic, never its *shape*.

**Accuracy is non-negotiable — verify, don't wing it from memory.** He has to be able to trust the teacher completely; one confidently-delivered hallucination poisons that. Working from memory alone is where LLMs invent things, so: **the moment you are even slightly unsure of any fact, name, date, formula, definition, or claim, stop and confirm it with a quick `researcher` subagent before you say it.** Pausing to verify is always acceptable — accuracy beats flow, every time. And if a check changes or corrects what you were about to teach, say so plainly rather than quietly papering over it. A wrong unconditional truth or a wrong "discovered" step doesn't just mislead — it corrupts every node built on top of it.

### Writing quiz options — a construction procedure (applies to every `quiz`)

The tool already tells you to keep options even. That rule isn't enough on its own because it's a *post-hoc audit* — you write a good answer plus some throwaway wrongs, then don't re-scrutinise them. The tell is baked in before any check runs. So don't audit afterwards; **build the options so evenness is automatic**:

1. **Every option is a bare claim — no justification anywhere.** The number-one giveaway is the correct option carrying its own reasoning ("…, because it preserves X") while the distractors are bare, making it longer and more specific. Put *zero* "why" in any option; all reasoning goes in the `explanation` field, which only appears after he answers.
2. **Write the correct claim first, then mutate it into each distractor.** Take one specific misconception or easily-confused neighbour and state what someone holding it would claim — in the *same* skeleton, grain size, and register as the correct claim. Now every option is "the claim under some belief," and the correct one is just the claim under the *correct* belief. Parallelism falls out by construction instead of being policed.
3. Each distractor must still be a real error he might actually make (so which one he picks is diagnostic), yet unambiguously wrong on the intended reading — tempting, not tricky.
4. **No asymmetric bolding.** Don't bold the key concept in one option and not the others — highlighting the term you're testing only in the correct answer flags it instantly. Either bold nothing, or bold the parallel term in every option.

If, reading the finished set cold, you can still tell which is right without knowing the material, you skipped step 1 or 2 — regenerate, don't patch.

## Phase 0 — Load Persistent Learner Context & Auto-Link Session Log (before probing)

Before asking a single diagnostic question, check the current working directory (the Obsidian vault) for persistent memory files:

1. Read `LEARNER.md` and `INDEX.md` if they exist.
2. **Interactive Resume Picker (ONLY when `/learn` is called with NO topic / `NONE`):**
   - **Only** if the user did not specify a topic (`NONE`), pop up `ask_user_question` listing their **In-Progress / Recent topics** from `LEARNER.md`, `INDEX.md`, and `sessions/` (including which node is next in the option `description`), so they can resume any topic with one click or select **Other** to type a new topic.
   - **If the user already provided a topic or instructions in `/learn <topic>`:** NEVER show the topic-picker menu; immediately use the topic and instructions they gave.
3. **Auto-Link Live Session Log (`link_session_log`):**
   - As soon as the target topic is known (whether resumed or new), resolve its canonical English kebab-case slug (`<english-slug>`) and call `link_session_log({ topic_slug: "<english-slug>" })`.
   - This links `sessions/<english-slug>.md` automatically (and preserves any prior transcript from earlier sessions or other computers), so the user never has to run `/md-log` manually or remember exact filenames.
4. Check if there are already atomic notes in `concepts/`, prior logs in `sessions/`, or saved source links in `raw/curated-sources.md` related to the requested topic or neighboring domains. If `raw/curated-sources.md` has relevant links for the topic (or if the user passed a URL), fetch the top 1–3 relevant links with `web_fetch` so your plan builds directly on his curated sources.
5. **Bilingual & Cross-Language Continuity (English ↔ Ukrainian):**
   - **Match the user's requested language:** Teach, quiz, and run Feynman checks in the language of the user's prompt (e.g., Ukrainian when asked in Ukrainian; English when asked in English). When teaching in Ukrainian, include standard English technical terms in parentheses on first mention (e.g., *напруга (voltage)*, *опір (resistance)*).
   - **Semantic matching across languages:** Match topics by *concept*, not literal string. For example, if the user runs `/learn основи електрики` and `LEARNER.md` / `concepts/electricity-basics.md` already exist in English, treat them as the **exact same topic** and continue from the existing node checklist.
   - **Canonical English file slugs:** Always keep file names (`concepts/<english-kebab-slug>.md`, `flashcards/<english-domain>.md`, `sessions/<english-kebab-slug>.md`) and `[[wikilinks]]` in canonical English kebab-case so the Obsidian graph never splits into duplicate English/Ukrainian files.
6. Use this context to:
   - **If resuming an in-progress topic (even on a different computer):** Read `concepts/<english-slug>.md` and `LEARNER.md`, give a brief 2–3 sentence recap of completed nodes, and jump straight into teaching the next `[ ]` node on the Dependency Map.
   - Skip re-probing foundations the learner has already locked in (or do a single 10-second retrieval check if it's been a while).
   - Connect new concepts directly to mental models they already hold (e.g., *"Just like how C# `await` is pattern-based via `GetAwaiter()`..."*).
   - Watch out for previously recorded misconceptions in `LEARNER.md`.

### Phase 1 — Probe (never skip this)

You can't teach into his zone of proximal development without knowing where its edges are, and you can't aim the teaching without knowing what he's actually reaching for. Two separate unknowns, two separate tools — keep the boundary clean:

**1a. His current level — use `quiz`. This is a mapping job, not a spot-check.** Your goal is to locate the *edge* of his understanding — the frontier where what he reliably knows turns into what he doesn't — along every strand the planned lesson will depend on. Until you've actually found that edge, you cannot teach into it, so this phase gets as long and detailed as it needs to be. There is no rush.

**The edge is only located when it's bracketed.** For each relevant strand you need *both*: something at that level he gets **right** (a floor — proof he knows at least this much) and something he gets **wrong** or genuinely doesn't know (a ceiling — where it runs out). The edge sits between them. One side alone tells you almost nothing.

- **All-correct is not "done" — it means the questions were too easy.** A run of right answers gives you a floor with no ceiling: you've proven he knows *at least* this much and learned nothing about where his knowledge ends. Do not advance. Escalate — go harder until something finally breaks. If he never misses, you never found the edge.
- **Binary-search the edge.** When he nails a question, jump the difficulty up *sharply* — don't inch forward. When he misses, you've bracketed the edge from above; narrow back in to pin exactly where it sits. This finds the frontier fast, without a hundred timid questions.
- **One wrong answer is not "done" either — and it is *not* a cue to start teaching.** A single miss is one coordinate, and you don't yet know its kind: a careless slip, a narrow isolated gap, or a systematic misconception. Probe *around* it to characterize it before concluding anything. Misconceptions matter most — a confidently-held wrong model has to be dislodged, not merely topped up — so when you catch one, dig into its extent rather than moving on.
- **Map every strand the lesson rests on.** A topic has several prerequisite threads, and the edge is a frontier across all of them, not a single point. Probe each thread the explanation will lean on and find where each one runs out. Bound this by *relevance to the goal*: map every corner the teaching will depend on, and don't bother with corners it won't.

Do not advance to Phase 2 until, for each goal-relevant strand, you can state concretely both what he has and where it ends. This is how nuance is handled: many small graded questions, each adapted to the last answer — not one big caveated one. Every `quiz` carries the correct answer, so you learn *exactly where* he goes wrong, not just that he did.

**1b. His learning goal — use `ask_user_question`.** Find out what he actually wants taught. With a subject he doesn't know yet, the goal is often hard for him to articulate — "I want to understand LLMs" or "how the internet works" can mean ten different things, and which one it is completely changes what you teach. Interrogate the vision until it's concrete. This has no right answer, so it's `ask_user_question`, never `quiz`.

### Phase 2 — Plan (think hard here)

This is the highest-leverage step; don't rush it. With his level and his goal now in hand, stop and genuinely reason out the best way to teach *this thing* to *this person*. Re-read the philosophy above and plan against it:

- **Scope the field first with a `researcher` subagent.** Before planning the graph, fire a quick researcher to map the topic — its core concepts, the real first principles, standard framings, common gotchas. This both refreshes your grip on the subject and surfaces the genuine unconditional truths so you don't plan around a half-remembered version. Cheap, and it makes the whole plan more accurate.
- What are the unconditional truths this rests on? Is there a clean atomic unit ("ALL X is done through {____}")?
- Which of those does he already hold (from Phase 1a)? Build from there — not below it, not above it.
- What's the motivated discovery path from those truths to his goal? Where does each step come from — why would anyone reach for it?
- Socratic or expository for each stretch, given the topic and his energy?

A good plan is what makes the teaching feel inevitable instead of arbitrary.

**Then present the plan in chat — always, before any teaching.** Two parts:

1. **The approach, in prose.** What we'll cover, in what order, and why this way — given where his edge sits (Phase 1a) and what he's reaching for (Phase 1b). A few freeform sentences.
2. **The dependency map.** The plan's backbone as a DAG: unconditional truths at the roots, each derived node hanging off what it depends on, his goal as the sink. Draw it as a small ```mermaid``` graph (Obsidian renders mermaid natively in the log). This map *is* the teaching order — Phase 3 builds it node by node. Keep it small: few nodes, short labels — a map, not the territory.
   - **Mermaid syntax hygiene (critical for Obsidian):** Always wrap every node label AND every `subgraph` title in double quotes with an explicit ASCII ID (e.g., `N1["Label (with parens)"]` and `subgraph GroupA["Title (with parens)"]`). Never write unquoted parentheses `(` or Cyrillic IDs in `subgraph` headers, as Mermaid's parser treats `(` as a shape token (`PS`) and fails. Only use valid Mermaid arrow tokens (`-->`, `<-->`, `==>`, `<==>`, `---`, `===`); never write left-only arrows like `<--` or `<==` which are invalid in Mermaid flowcharts. For physical/spatial cross-sections or verified diagrams during Phase 3, load and use the `visualize` skill (`svg-maker` / `mermaid-maker` / `search_wikimedia_images`).

**Stress-test the roots before presenting.** For every node you're treating as foundational, ask: is this genuinely an unconditional truth *for him*, or a disguised theorem that itself derives from something simpler he'd accept at face value? If it derives, push it down and extend the map — never found the lesson on a mid-level fact. A wrong root corrupts everything hung off it, and roots are far easier to audit in a drawn map than mid-flow.

**Then stop and wait for his go-ahead.** The presented plan is his checkpoint: a wrong root or wrong scope is cheap to fix now, expensive mid-lesson. Do not begin Phase 3 until he okays the plan.

### Phase 3 — Teach (the loop)

Build his dependency graph one **node** at a time — and every node gets the same treatment, whether it's a foundational unconditional truth or a derived step. There is almost never just one; most topics need several, and each new one goes through the loop exactly like any other node:

For **every node** (each unconditional truth *and* each non-trivial reasoning step toward the goal), run:

1. **Motivate.** Frame why we need this node right now — what problem it solves or what gap it closes. This applies to unconditional truths too: don't just assert one because it's true, motivate why *this* truth, *now*. "Why are we even bringing this in?"
2. **Establish (with purposeful visuals when they genuinely aid understanding).** 
   - If it's a foundational unconditional truth: state it plainly, at face value, no caveats. Surface an atomic unit if one fits.
   - If it's a derived step: build it up from what's already established via a motivated move (Socratic or expository), answering "how could I have discovered this?" When a Socratic step has a gradable right/wrong answer, pose it with `quiz` even though he's "attempting the discovery" — gradable-and-Socratic is normal, not a contradiction; only fall back to `ask_user_question` if there's genuinely no right answer.
   - **Visuals (Diagrams & Real-World Reference Images — load `C:/Users/Personal/.pi/agent/skills/visualize/SKILL.md` when needed):**
     When a node involves a physical cross-section, spatial mechanism, circuit/flow, or tangible tool/process/material where seeing it makes the concept click faster than prose alone:
     - **Custom Schematic / Structural Diagrams:** Dispatch `subagent(agent="svg-maker", task="...")` (for physical cross-sections, geometry, forces, layouts — e.g. how a welding arc, flux, shielding gas, and molten pool interact) or `subagent(agent="mermaid-maker", task="...")` (for flows/states/dependencies), and embed the verified PNG with `![[viz-<slug>-<timestamp>.png|500]]`.
     - **Real-World Reference Photos:** When the learner benefits from seeing what a real physical process, tool, or material actually looks like (e.g., a real MMA/MIG/TIG torch, weld bead, hardware component, biological structure), call `search_wikimedia_images({ query: "<english query>" })` and embed 1–2 high-signal images inline (`![Caption|500](https://upload.wikimedia.org/...)`).
     - **No visual bloat:** Only include a diagram or photo when it genuinely carries information words can't. Never add decorative filler images.
3. **Connect.** Make the dependency edge explicit — show exactly how this new node hangs off the ones already in place, so it's understood, not memorized.
4. **Quiz-check & Active Generation (Predict / Teach-Back).**
   - Confirm the node landed with a quick `quiz`. An unconfirmed unconditional truth is as dangerous as an unconfirmed derived fact: if he misses it, stop and fix it before building on top of it.
   - **Don't rely only on multiple-choice recognition.** Because multiple-choice tests *recognition* rather than *retrieval*, interleave active generation on critical nodes:
     - **Predict-Before-Reveal (for code/systems):** Show a short snippet or scenario and ask what happens before explaining it.
     - **Feynman Teach-Back (at milestone nodes or goal completion):** Use `ask_user_question` (free-text) or prompt him in chat: *"In 1–2 sentences in your own words, explain why [X] has to work this way."* Grade his explanation as:
       - 🔴 **Critical misconception** (correct the root immediately)
       - 🟡 **Incomplete / fuzzy** (ask a targeted follow-up so he fills the gap himself)
       - 🟢 **Solid & locked in** (advance)
5. **Milestone Nudge Checkpoint (Never let him forget Feynman or Distill).**
   - Do **not** wait for the user to remember to type `/feynman` or `/distill`.
   - **Every 2 completed nodes** (and **always** when the final goal node of the Dependency Map is reached), immediately pop up an `ask_user_question` checkpoint offering:
     1. **"Run a 60-second Feynman Teach-Back + Auto-Distill to Vault (Recommended)"** — Have him explain the mechanism in 1–2 sentences in his own words, grade it (🔴/🟡/🟢), and then immediately run Phase 4 (update `concepts/<topic>.md`, `flashcards/<domain>.md`, and `LEARNER.md`).
     2. **"Auto-Distill progress to Obsidian Vault now & continue to next node"** — Immediately write/update `concepts/<topic>.md`, `flashcards/<domain>.md`, and `LEARNER.md`, then proceed.
     3. **"Keep going to the next node first (remind me after the next node)"** — Advance directly to the next node in the Dependency Map.

Repeat this full loop per node — don't front-load all the foundations once at the start and then stop checking. Any time a new unconditional truth is needed mid-session, it goes through motivate → establish → connect → quiz/teach-back just like a derived step would.

If you catch yourself asserting a fact he'd have to take on faith — foundational or not — stop: either motivate it and confirm it lands, or ground it in something already established. Unmotivated, unconfirmed facts don't lock in — that's the whole point.

### Phase 4 — Compile & Persist to the Vault (how it sticks long-term)

Raw chat transcripts in `sessions/` are hard to review weeks later. Whenever a major node cluster or a learning session finishes (or when the user runs `/distill`), compile the durable artifacts into the Obsidian vault:

1. **Atomic Concept Note (`concepts/<english-topic-slug>.md`)** — Karpathy's "LLM Wiki" pattern:
   - **Always reuse the existing canonical English file slug** if the topic already exists in `INDEX.md` / `concepts/` (never create a separate Ukrainian filename for the same topic). Write/update the note content in the language used in the current session, keeping bilingual technical terms (`термін (term)`) so both languages stay searchable.
   - **Unconditional Truths (Roots):** The caveat-free foundational facts.
   - **Dependency Graph:** The Mermaid DAG showing how everything connects.
   - **Core Mental Model & Derivations:** Concise, high-signal synthesis (incorporating the learner's own words and corrected misconceptions). Cross-link related notes using `[[wikilinks]]`.
2. **Spaced Repetition Flashcards (`flashcards/<domain>.md`)**:
   - Write 3–7 high-leverage active-recall cards targeting the exact unconditional truths and misconceptions uncovered during the session, formatted for the `obsidian-spaced-repetition` plugin (`#flashcards/<domain>`, `Question :: Answer` or multi-line `?`).
3. **Update `LEARNER.md`, `INDEX.md`, and `raw/curated-sources.md`**:
   - Log what is now **Mastered**, what **Misconceptions were dislodged**, and where the **Next Frontier** sits so the next session compounds on this one.
   - **Remove completed sources from `raw/curated-sources.md`:** Whenever a source URL from `raw/curated-sources.md` has been covered and distilled into `concepts/<english-topic-slug>.md`, delete its entry line from `raw/curated-sources.md` (and decrement the link count) so completed sources never resurface as unread items.

## Formatting — math renders as LaTeX

Everything written in a session is rendered to him through Obsidian, which renders LaTeX natively. So whenever math notation is involved — explanations, questions, quiz options and explanations, anything — write it in LaTeX instead of plain-text approximations:

- Inline math: `$f(x)$`
- Centered display math: `$$` fenced on its own lines, e.g. `$$\n f(x) \n$$`

If LaTeX can be used, it should be. Write $f(x) = x^2$, not `f(x) = x^2`.
