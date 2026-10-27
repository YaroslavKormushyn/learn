/**
 * visual-tools
 *
 * A self-contained pi extension that registers custom subagent tools with the
 * globally-loaded `interactive-subagents` / `pi-subagents` extension:
 *
 *   • write_mermaid / edit_mermaid / render_mermaid (tools/mermaid_tools.ts)
 *   • write_svg / edit_svg / render_svg             (tools/svg_tools.ts)
 *   • write_demo / edit_demo / render_demo          (tools/demo_tools.ts)
 *   • pdf_info / pdf_extract / pdf_search / pdf_render (tools/pdf_tools.ts)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const EXT_DIR = path.dirname(fileURLToPath(import.meta.url))
const MERMAID_TOOLS = path.join(EXT_DIR, "tools", "mermaid_tools.ts")
const SVG_TOOLS = path.join(EXT_DIR, "tools", "svg_tools.ts")
const DEMO_TOOLS = path.join(EXT_DIR, "tools", "demo_tools.ts")
const PDF_TOOLS = path.join(EXT_DIR, "tools", "pdf_tools.ts")

interface InteractiveSubagentsApi {
  registerToolExtension: (name: string, extensionPath: string) => void
}

function registerToolExtensions(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (globalThis as any).__pi_interactive_subagents as InteractiveSubagentsApi | undefined
  if (!api?.registerToolExtension) return

  for (const [name, toolPath] of [
    ["write_mermaid", MERMAID_TOOLS],
    ["edit_mermaid", MERMAID_TOOLS],
    ["render_mermaid", MERMAID_TOOLS],
    ["write_svg", SVG_TOOLS],
    ["edit_svg", SVG_TOOLS],
    ["render_svg", SVG_TOOLS],
    ["write_demo", DEMO_TOOLS],
    ["edit_demo", DEMO_TOOLS],
    ["render_demo", DEMO_TOOLS],
    ["pdf_info", PDF_TOOLS],
    ["pdf_extract", PDF_TOOLS],
    ["pdf_search", PDF_TOOLS],
    ["pdf_render", PDF_TOOLS],
  ] as const) {
    if (!fs.existsSync(toolPath)) continue
    try {
      api.registerToolExtension(name, toolPath)
    } catch {
      // Already registered under a different path, or re-registered — ignore.
    }
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async () => {
    registerToolExtensions()
  })
}
