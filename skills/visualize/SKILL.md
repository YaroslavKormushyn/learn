---
name: visualize
description: "Add a correct, minimal visual or interactive instrument to a lesson — a diagram, geometric picture, interactive HTML simulation, or real-world photo — that renders inline in the Obsidian log. Outsources authoring+rendering to a maker subagent (`mermaid-maker`, `svg-maker`, or `demo-maker`) that verifies the output before returning."
---

# Visualize & Interactive Demos

A picture or interactive instrument earns its place only when it shows something words can't — shape, structure, direction, relationship, geometry, or dynamic parameter behavior. This skill produces ONE such artifact, guarantees it is **correct** (the maker renders/executes it and looks at it before returning), and drops it into the lesson so it renders inline in the Obsidian `md-log` file and concept note.

You are the **creative director**. You decide the exact idea and distill it to its fewest carrying elements. A **maker subagent** does the authoring, rendering, headless/visual verification, and saving, then returns the filename(s). You embed the returned artifact in your reply.

## Choose the Right Tool

Four options, depending on whether you need a relational graph, a custom schematic/geometric drawing, an interactive parameter-sweep simulation, or a real-world photo:

1. **`mermaid-maker`** (subagent) — structural/relational visuals: dependency graphs, flowcharts, sequence/state/ER/class diagrams, trees, mindmaps, timelines.
2. **`svg-maker`** (subagent) — static spatial/geometric visuals and physical cross-sections Mermaid can't lay out: exact coordinates, physical process schematics (e.g. welding arc + shielding gas + molten pool cross-section, voltage drop diagram), geometry figures, number lines, vectors, plots.
3. **`demo-maker`** (subagent) — **interactive HTML/JS/Canvas teaching instruments** when a concept is *dynamic*: a parameter to sweep with a slider (e.g., sweeping voltage $V$ and resistance $R$ to see current $I = V/R$ and power dissipation $P = I^2 R$ change live), an animation/wave/phasor to step through, or a system to simulate. Ten seconds of dragging a slider teaches more than three paragraphs about parameter sensitivity.
4. **`search_wikimedia_images`** (direct tool) — real-world reference photos and technical illustrations from Wikimedia Commons when the learner needs to see what an actual physical tool, process, material, or component looks like in reality.

Rule of thumb:
- *Nodes-and-edges / relationships* → `mermaid-maker`
- *Static custom schematic / cross-section / geometry* → `svg-maker`
- *Dynamic system / parameter sweep / interactive slider simulation* → `demo-maker`
- *What a real physical thing/process looks like in the real world* → `search_wikimedia_images`

## Brief the Maker Well: One Idea, Fewest Elements

Before briefing, prune to the fewest elements that carry the idea, and for each ask: *"if I delete this, is the idea still clear?"* If yes, delete it.

- For `mermaid-maker` / `svg-maker`: give the concept and the 4–7 concrete elements, coordinates, or arrows needed.
- For `demo-maker`: specify the exact concept, every slider/control and its range/units, what visual updates on the canvas/SVG, and the exact mathematical formula governing the readout.

## Invoke Synchronously (`async: false`)

Dispatch the maker synchronously (`async: false`) with the `subagent` tool so the verified filename returns in the same turn:

```
subagent({ agent: "mermaid-maker", async: false, task: "<your minimal, concrete brief>" })
```
```
subagent({ agent: "svg-maker", async: false, task: "<your minimal, concrete brief>" })
```
```
subagent({ agent: "demo-maker", async: false, task: "<your concrete interactive simulation brief>" })
```

## Embed It in the Lesson

- **For `mermaid-maker` / `svg-maker` (`viz-<slug>-<timestamp>.png`):**
  Embed using Obsidian's wikilink with the returned filename and display width:
  ```markdown
  ![[viz-<slug>-<timestamp>.png|500]]
  ```
- **For `demo-maker` (`demo-<slug>-<timestamp>.html`):**
  Embed the live interactive HTML instrument directly via an `<iframe>` pointing to `viz/<html_filename>` (Obsidian renders local relative `<iframe>`s natively inside notes!), and tell the learner specifically which slider/control to try:
  ```markdown
  <iframe src="viz/demo-<slug>-<timestamp>.html" width="100%" height="460" style="border:1px solid #d0d7de;border-radius:8px;background:#ffffff;"></iframe>
  ```
- **For `search_wikimedia_images`:**
  ```markdown
  ![Caption|500](https://upload.wikimedia.org/...)
  ```
