/**
 * Interactive HTML/Canvas/SVG Demo authoring loop for the demo-maker subagent —
 * three tools that share one session-scoped HTML file:
 *
 *   write_demo   — write the full self-contained HTML document to the session's file
 *   edit_demo    — exact-match old_text→new_text on that file (pi-edit semantics)
 *   render_demo  — headlessly execute the HTML in Chrome (checking console errors,
 *                  uncaught page errors, failed requests, and optional JS `probe`
 *                  expressions) AND capture a high-DPI screenshot PNG returned
 *                  inline so you can visually verify layout + controls. When
 *                  `save_as` is set (and headless verification passes), publishes
 *                  BOTH `viz/demo-<slug>-<ts>.html` (for Obsidian `<iframe>` embed)
 *                  and `viz/demo-<slug>-<ts>.png` (static preview).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Type } from "@sinclair/typebox"
import { pathToFileURL } from "node:url"
import {
  applyEdit,
  copyFileSync,
  existsSync,
  FILES_DIRNAME,
  findChrome,
  join,
  mkdirSync,
  readFileSync,
  type Session,
  snippetAround,
  writeBody,
  writeFileSync,
} from "./_common.ts"

const GROUP = "demo"
const BODY_FILE = "demo.html"

interface DemoRunReport {
  ok: boolean
  consoleErrors: string[]
  pageErrors: string[]
  failedRequests: string[]
  probeResult?: unknown
  screenshot?: Buffer
}

let session: Session | null = null

async function executeAndScreenshotDemo(
  htmlPath: string,
  outPngPath: string,
  opts: { probe?: string; settleMs?: number } = {},
): Promise<DemoRunReport> {
  const chrome = findChrome()
  if (!chrome) {
    return {
      ok: false,
      consoleErrors: [],
      pageErrors: ["No Chrome/Edge executable found to verify the interactive demo."],
      failedRequests: [],
    }
  }

  const settleMs = opts.settleMs ?? 1200
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const failedRequests: string[] = []
  let probeResult: unknown
  let probed = false

  const puppeteer = await import("puppeteer")
  const browser = await puppeteer.default.launch({
    executablePath: chrome,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 920, height: 520, deviceScaleFactor: 2 })

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text())
    })
    page.on("pageerror", (err) => {
      pageErrors.push(err instanceof Error ? err.message : String(err))
    })
    page.on("requestfailed", (req) => {
      failedRequests.push(`${req.url()} (${req.failure()?.errorText ?? "failed"})`)
    })

    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: 30_000 })
    await new Promise((r) => setTimeout(r, settleMs))

    if (opts.probe) {
      try {
        probeResult = await page.evaluate(opts.probe)
        probed = true
      } catch (err) {
        pageErrors.push(`probe failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    await page.screenshot({ path: outPngPath, fullPage: true })
  } catch (err) {
    pageErrors.push(err instanceof Error ? err.message : String(err))
  } finally {
    await browser.close().catch(() => {})
  }

  const screenshot = existsSync(outPngPath) ? readFileSync(outPngPath) : undefined
  const ok = consoleErrors.length === 0 && pageErrors.length === 0 && failedRequests.length === 0 && Boolean(screenshot)

  return {
    ok,
    consoleErrors,
    pageErrors,
    failedRequests,
    ...(probed ? { probeResult } : {}),
    screenshot,
  }
}

function publishDemo(
  htmlPath: string,
  pngPath: string,
  slug: string,
): { htmlFilename: string; htmlDest: string; pngFilename: string; pngDest: string } {
  const filesDir = join(process.cwd(), FILES_DIRNAME)
  mkdirSync(filesDir, { recursive: true })
  const clean =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "demo"
  const ts = Date.now()
  const htmlFilename = `demo-${clean}-${ts}.html`
  const pngFilename = `demo-${clean}-${ts}.png`
  const htmlDest = join(filesDir, htmlFilename)
  const pngDest = join(filesDir, pngFilename)
  copyFileSync(htmlPath, htmlDest)
  copyFileSync(pngPath, pngDest)
  return { htmlFilename, htmlDest, pngFilename, pngDest }
}

export default function demoToolsExtension(pi: ExtensionAPI) {
  // ── write_demo ─────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "write_demo",
    label: "Write Demo HTML",
    description:
      "Write the FULL self-contained HTML document (`<!DOCTYPE html><html>...</html>`) for " +
      "an interactive teaching demo to this session's managed file. All CSS and JS must be " +
      "inline (vanilla JS + Canvas 2D / SVG; no localStorage/sessionStorage). Writing does " +
      "NOT test or render — call `render_demo` next to headlessly execute and visually inspect it.",
    parameters: Type.Object({
      source: Type.String({
        description: "Complete self-contained HTML document (`<!DOCTYPE html>...</html>`).",
      }),
    }),
    async execute(_id, params) {
      const source = (params.source ?? "").trim()
      if (!source) throw new Error("`write_demo` requires a non-empty `source`.")
      if (!/<html/i.test(source)) {
        throw new Error("`write_demo`: source must be a complete HTML document containing `<html>...</html>`.")
      }
      session = writeBody(GROUP, BODY_FILE, source)
      const lines = source.split("\n").length
      return {
        content: [
          {
            type: "text",
            text: `Wrote ${lines}-line HTML demo (${source.length} bytes).\nNow call render_demo to headlessly execute it and inspect its visual layout.`,
          },
        ],
        details: { ok: true, path: session.bodyPath, lines },
      }
    },
  })

  // ── edit_demo ──────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "edit_demo",
    label: "Edit Demo HTML",
    description:
      "Make a single exact-match replacement in this session's HTML demo source. " +
      "`old_text` must appear EXACTLY ONCE. Call `write_demo` first. Always follow " +
      "with `render_demo` to re-verify.",
    parameters: Type.Object({
      old_text: Type.String({ description: "Exact substring of the current HTML source to replace (must match once)." }),
      new_text: Type.String({ description: "Replacement text for `old_text`." }),
    }),
    async execute(_id, params) {
      if (!session || !existsSync(session.bodyPath)) {
        throw new Error("edit_demo: no source yet — call write_demo first.")
      }
      const current = readFileSync(session.bodyPath, "utf8")
      const { updated, index } = applyEdit(current, String(params.old_text ?? ""), String(params.new_text ?? ""))
      writeFileSync(session.bodyPath, updated, "utf8")
      return {
        content: [
          {
            type: "text",
            text:
              "Applied edit. Updated region:\n```\n" +
              snippetAround(updated, index) +
              "\n```\nCall render_demo to re-test and inspect.",
          },
        ],
        details: { ok: true, path: session.bodyPath },
      }
    },
  })

  // ── render_demo ────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "render_demo",
    label: "Run & Render Demo",
    description:
      "Headlessly load and execute the current HTML demo in Chrome, check for console errors, " +
      "uncaught exceptions (`window.onerror`), and failed network requests, optionally evaluate " +
      "a `probe` JS expression in the page, AND capture a PNG screenshot so you can visually " +
      "verify the layout, sliders, and canvas.\n\n" +
      "Iterate with no `save_as` first. Once the demo passes with ZERO errors and looks clean, " +
      "call `render_demo({ save_as: '<short-kebab-slug>' })` to publish `viz/demo-<slug>-<ts>.html` " +
      "and `viz/demo-<slug>-<ts>.png` into the vault.",
    parameters: Type.Object({
      probe: Type.Optional(
        Type.String({
          description:
            "Optional JS expression evaluated in the page after settling (e.g. `document.querySelectorAll('input[type=range]').length`).",
        }),
      ),
      save_as: Type.Optional(
        Type.String({
          description:
            "Short kebab-case topic slug (e.g. 'ohms-law-circuit'). When set and verification passes, publishes the interactive HTML and preview PNG into <cwd>/viz.",
        }),
      ),
    }),
    async execute(_id, params) {
      if (!session || !existsSync(session.bodyPath)) {
        throw new Error("render_demo: no source yet — call write_demo first.")
      }
      const { workDir, bodyPath } = session
      mkdirSync(workDir, { recursive: true })
      const outPngPath = join(workDir, `demo-render-${Date.now()}.png`)

      const report = await executeAndScreenshotDemo(bodyPath, outPngPath, {
        probe: params.probe ? String(params.probe) : undefined,
      })

      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = []

      if (!report.ok) {
        const lines: string[] = ["HEADLESS VERIFICATION FAILED — fix with edit_demo and run render_demo again:"]
        if (report.consoleErrors.length > 0) {
          lines.push("Console errors:\n" + report.consoleErrors.slice(0, 10).map((e) => `  - ${e}`).join("\n"))
        }
        if (report.pageErrors.length > 0) {
          lines.push("Uncaught page errors:\n" + report.pageErrors.slice(0, 10).map((e) => `  - ${e}`).join("\n"))
        }
        if (report.failedRequests.length > 0) {
          lines.push("Failed requests:\n" + report.failedRequests.slice(0, 10).map((e) => `  - ${e}`).join("\n"))
        }
        content.push({ type: "text", text: lines.join("\n\n") })
        if (report.screenshot) {
          content.push({ type: "image", data: report.screenshot.toString("base64"), mimeType: "image/png" })
        }
        return { content, details: { ok: false } }
      }

      const probeNote =
        report.probeResult !== undefined ? `\nProbe result: ${JSON.stringify(report.probeResult)}` : ""

      if (params.save_as) {
        const pub = publishDemo(bodyPath, outPngPath, String(params.save_as))
        content.push({
          type: "text",
          text:
            `PASSED headless verification (0 console errors, 0 page errors).${probeNote}\n` +
            `Published interactive demo to viz/:\n` +
            `html_filename: ${pub.htmlFilename}\n` +
            `html_path: ${pub.htmlDest}\n` +
            `png_filename: ${pub.pngFilename}\n` +
            `png_path: ${pub.pngDest}\n\n` +
            `LOOK at the screenshot below to confirm the layout and readouts are clean before returning.`,
        })
        content.push({ type: "image", data: report.screenshot!.toString("base64"), mimeType: "image/png" })
        return {
          content,
          details: {
            ok: true,
            htmlFilename: pub.htmlFilename,
            htmlPath: pub.htmlDest,
            pngFilename: pub.pngFilename,
            pngPath: pub.pngDest,
          },
        }
      }

      content.push({
        type: "text",
        text:
          `PASSED headless verification (0 console errors, 0 page errors).${probeNote}\n` +
          `Preview render (not yet saved). LOOK at the screenshot below: are controls labeled with live value readouts, is the canvas/diagram clear and unclipped? Fix with edit_demo, or call render_demo with \`save_as\` to publish.`,
      })
      content.push({ type: "image", data: report.screenshot!.toString("base64"), mimeType: "image/png" })
      return { content, details: { ok: true, path: outPngPath } }
    },
  })
}
