---
description: Add or enrich a word/phrase in your structured Obsidian vocabulary (`vocab/<lang>/<word>.md`) with etymology, examples, and spaced-repetition flashcards
argument-hint: "<word-or-phrase> [optional context]"
---
Create or update a strict atomic vocabulary note for: **${@}**

1. **Determine the language (`lang`):**
   - `en` for English (`vocab/en/<slug>.md`)
   - `uk` for Ukrainian (`vocab/uk/<slug>.md`)
   - `de` for German (`vocab/de/<slug>.md`)
   *(Use lowercase filename slug, e.g., `vocab/en/contentious.md`, `vocab/en/ground-zero.md`, `vocab/uk/дихотомія.md`).*

2. **Check if `vocab/<lang>/<slug>.md` already exists first (`read`):**
   - **If it already exists:**
     - Tell the user the word is already in their dictionary.
     - **Preserve any `<!--SR:...-->` scheduling comments** inside `## 🧠 Flashcards` so their Spaced Repetition interval/history is never reset!
     - If it was an imported stub (`status: archive-import` or missing `Root / Memory Hook` / `Collocations`), upgrade it to `status: learning` and tag `flashcards/vocab/<lang>`, enrich the missing fields (`pos`, `Root / Memory Hook`, `Collocations`), and append any new context example the user provided.
   - **If it does not exist yet:**
     - Create `vocab/<lang>/<slug>.md` using the strict format below.
     - If the word appears in `vocab/QUEUE.md` as `- [ ] <word>`, mark it as `- [x] <word>`.

3. **Strict note format (`vocab/<lang>/<slug>.md`):**
   ```markdown
   ---
   word: "<word or phrase>"
   lang: <en|uk|de>
   pos: <noun|verb|adjective|adverb|phrase|idiom>
   ipa: "<IPA transcription>"
   translation: "<concise Ukrainian translation (or English equivalent if lang=uk)>"
   synonyms: [<2-4 synonyms>]
   antonyms: [<1-3 antonyms>]
   domain: <general|tech|science|formal|idiom>
   status: learning
   added: <YYYY-MM-DD>
   tags:
     - vocab/<lang>
     - flashcards/vocab/<lang>
   ---

   # <word> *(<ipa>)* — <pos>

   - **Meaning:** <Clear, face-value definition in the target language>
   - **Українською:** <Точний переклад та відтінки значення українською>
   - **Root / Memory Hook (Етимологія):** <How the word is built (roots/prefixes) or a vivid mental hook so it locks in without rote memorization>
   - **Collocations:** *<collocation 1>*, *<collocation 2>*, *<collocation 3>*
   - **Examples:**
     1. <Natural example sentence 1 with **<word>** bolded>
     2. <Natural example sentence 2 (ideally connected to tech/science/real life) with **<word>** bolded>

   ---

   ## 🧠 Flashcards
   **<word>** *(<ipa>, <pos>)* :: **<translation>** — <short meaning> *(Hook: <short root/memory hook>)*

   <Context sentence where the target word is wrapped in ==<word>;;<translation / short hint>== for active recall>
   ```

4. Briefly confirm whether the note was **created** or **updated/upgraded from archive**, and show the memory hook + examples in chat.
