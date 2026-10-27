# Deliberate Practice & The Hint Ladder (`/practice`)

After completing a lesson with `/learn`, a concept is **active** in your working memory — when a quiz asks about it 30 seconds after it was derived, you know which concept to use.

In the real world, however, problems do not announce which theorem or mental model applies. **Deliberate Practice (`/practice`)** trains your brain to retrieve and run the right propositions from the **inactive state**.

---

## 1. The Inactivity Constraint

- **Never Announce the Target:** Every problem posed in `/practice` describes a concrete situation or system without naming the target proposition or formula. Only features of the situation itself may cue retrieval.
- **Interleaving by Default:** Problems switch across different nodes and concepts from your vault note (`concepts/<slug>.md`) rather than repeating the same formula five times in a row. Switching clears working memory and forces genuine retrieval.
- **Pre-Committed Solutions (`explain`):** Before you ever see a problem, the agent must solve it, verify there are no unintended shortcuts, and commit the full step-by-step `committedAnswer` inside the `explain` tool call.

---

## 2. The Three Demand Modes (Prerequisite Order)

Within each target concept, demands progress through three modes in order:

| Mode | What It Trains | Problem Shape |
| :--- | :--- | :--- |
| **1. Recall** | Deploying the proposition from weak or varied cues | 1–2 decision points, fresh situation class, concise setup. |
| **2. Discrimination** | Choosing the right proposition against a near-twin confusable | Two superficially similar setups where one separating feature determines which law applies. |
| **3. Composition** | Running a multi-step reasoning chain under load | Multi-step problem with decision junctions and realistic distractor givens. |

Three **Demand Templates** can modify any mode:
1. **Reverse:** Gives you the final outcome or symptom and asks what initial conditions or parameters had to cause it.
2. **Discriminate:** Contrasts two near-twin scenarios directly.
3. **Probe the Premises:** Weakens or removes one assumption from a standard derivation and asks what breaks.

---

## 3. The 6-Rung Hint Ladder (`R0`–`R5`)

Revealed information cannot be unrevealed. When you are working on a problem in the `explain` TUI and select **"💡 I'm stuck / Check my work so far"**, the tool does **not** reveal the `committedAnswer`. Instead, it sends your partial working trace to the agent, which diagnoses the **first step where your reasoning stalled** and gives **one surgical rung of help**:

| Rung | Name | What It Gives | What Remains Yours |
| :--- | :--- | :--- | :--- |
| **`R0`** | **Attention Redirect** | *"Re-read the second condition in the problem."* | Pattern recognition, retrieval, and execution. |
| **`R1`** | **Pattern Re-Description** | *"What you're looking at is a conservation balance across a junction."* | Retrieving the specific law and executing it. |
| **`R2`** | **Candidate Class** | *"Something from how energy per unit charge behaves in a loop applies."* | Discriminating the exact law and executing it. |
| **`R3`** | **Proposition Named** | *"Apply Kirchhoff's Voltage Law ($\sum \Delta V = 0$) around the outer loop."* | Setting up and executing the step. |
| **`R4`** | **Move Outlined** | Outlines the structure of the step without computing it. | Completing the calculation and remaining steps. |
| **`R5`** | **Worked Step** | Shows the completed step so you can finish the rest of the problem. | Completing the boundary/downstream steps. |

---

## 4. Miss Classification & Fresh-Surface Retests

When you submit a final answer, the pre-committed reference solution is revealed and the agent classifies any miss into one of five categories:
- **Cue miss:** Nothing came to mind from the problem setup.
- **Discrimination error:** A neighboring/confusable concept won out.
- **Execution slip:** Right concept selected, error in algebra or application.
- **Careless slip:** Minor arithmetic or reading oversight.
- **Structural misconception:** The retrieved rule itself is held incorrectly (repaired with a surgical 1–2 sentence correction).

**The Retest Law:** Any problem that was missed, required a heavy hint (`R3` or higher), or was surrendered (`I don't know`) **must be retested in a fresh surface scenario** before the practice session concludes.
