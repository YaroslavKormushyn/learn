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

2. **Write `vocab/<lang>/<slug>.md` using this exact strict format:**
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

3. Briefly confirm the file path created and show the memory hook + examples in chat.
