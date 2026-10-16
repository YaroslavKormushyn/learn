---
description: Distill the current learning session into clean Obsidian concept notes, flashcards, and learner memory
argument-hint: "[topic-slug]"
---
Execute **Phase 4 (Compile & Persist to the Vault)** from the `teach` skill for our session (${1:-auto-detect topic slug}):

1. **Create or update the atomic concept note** in `concepts/<topic-slug>.md`:
   - Include YAML frontmatter (`tags`, `domain`, `status`, `last_reviewed`).
   - **Unconditional Truths (Roots):** Caveat-free foundational truths.
   - **Dependency Graph:** Mermaid DAG of how the truths connect to the derived mechanisms.
   - **Core Mental Model:** Clean, concise breakdown of each node and corrected misconceptions, with `[[wikilinks]]` to related concepts.
2. **Append Spaced Repetition flashcards** to `flashcards/<domain>.md`:
   - Add `#flashcards/<domain>` at the top if new.
   - Write 3–7 high-signal active recall cards (`Question :: Answer` or multi-line `?` format compatible with Obsidian Spaced Repetition) targeting the roots and the exact misconceptions we uncovered.
3. **Update `LEARNER.md` and `INDEX.md`**:
   - Record newly mastered concepts, dislodged misconceptions, and the next frontier.
