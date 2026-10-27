/**
 * PDF triage, search, text extraction, and visual page rendering tools for the
 * `pdf-reader` subagent:
 *
 *   pdf_info     — page count + per-page signals (text_length, image_count, math_density)
 *   pdf_extract  — extract text from a page range ('all', '1-5', '1,3,7', '3')
 *   pdf_search   — keyword or regex search across all pages with context lines
 *   pdf_render   — render up to 6 pages to PNG images via headless Chrome + pdf.js
 *                  and return them inline so the vision model can read equations,
 *                  tables, and figures visually.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Type } from "@sinclair/typebox"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { findChrome } from "./_common.ts"

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url))
const EXTENSION_DIR = path.dirname(TOOL_DIR)
const PDFJS_MODULE_PATH = path.join(EXTENSION_DIR, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs")
const PDFJS_WORKER_PATH = path.join(EXTENSION_DIR, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs")
const STANDARD_FONTS_DIR =
  path.join(EXTENSION_DIR, "node_modules", "pdfjs-dist", "standard_fonts").replace(/\\/g, "/") + "/"

const EXTRACT_CAP = 24_000
const RENDER_BATCH_CAP = 6

async function loadPdfjs(): Promise<any> {
  return await import(pathToFileURL(PDFJS_MODULE_PATH).href)
}

function resolvePdfPath(rawPath: string): string {
  const trimmed = rawPath.trim()
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed)
}

async function openDocument(filePath: string) {
  const pdfjs = await loadPdfjs()
  const data = new Uint8Array(await fs.readFile(filePath))
  const task = pdfjs.getDocument({
    data,
    standardFontDataUrl: STANDARD_FONTS_DIR,
    verbosity: 0,
  })
  return { doc: await task.promise, task, pdfjs }
}

function itemsToText(items: unknown[]): string {
  let out = ""
  let lastY: number | null = null
  for (const it of items) {
    if (it && typeof it === "object" && "str" in (it as Record<string, unknown>)) {
      const obj = it as { str?: unknown; transform?: number[]; hasEOL?: boolean }
      const y = Array.isArray(obj.transform) ? obj.transform[5] : null
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 3 && !out.endsWith("\n")) {
        out += "\n"
      }
      if (typeof obj.str === "string") {
        out += obj.str
        if (obj.hasEOL) out += "\n"
      }
      if (y !== null) lastY = y
    }
  }
  return out
}

function mathDensity(text: string): number {
  let mathChars = 0
  for (const c of text) {
    const code = c.codePointAt(0)!
    if (
      (code >= 0x2200 && code <= 0x22ff) ||
      (code >= 0x2100 && code <= 0x214f) ||
      (code >= 0x2190 && code <= 0x21ff) ||
      (code >= 0x27c0 && code <= 0x27ef) ||
      (code >= 0x2980 && code <= 0x29ff) ||
      (code >= 0x2a00 && code <= 0x2aff) ||
      (code >= 0x0370 && code <= 0x03ff) ||
      (code >= 0x1d400 && code <= 0x1d7ff) ||
      "∫∑∏√∂∇∞≈≠≤≥±×÷∈∉⊂⊃∪∩∧∨¬∀∃∅".includes(c)
    ) {
      mathChars++
    }
  }
  return mathChars / Math.max(text.length, 1)
}

function parsePageSpec(spec: string, total: number, cap = Infinity): number[] {
  const trimmed = spec.trim().toLowerCase()
  if (trimmed === "all") {
    const count = Math.min(total, cap)
    return Array.from({ length: count }, (_, i) => i + 1)
  }
  const pages = new Set<number>()
  for (const part of spec.split(",")) {
    const p = part.trim()
    if (!p) continue
    if (p.includes("-")) {
      const [sRaw, eRaw] = p.split("-", 2) as [string, string]
      const start = Math.max(1, parseInt(sRaw, 10) || 1)
      const end = Math.min(total, parseInt(eRaw, 10) || start)
      for (let pg = start; pg <= end && pages.size < cap; pg++) pages.add(pg)
    } else {
      const pg = parseInt(p, 10)
      if (pg >= 1 && pg <= total && pages.size < cap) pages.add(pg)
    }
  }
  return [...pages].sort((a, b) => a - b)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function renderPagesInChrome(
  filePath: string,
  pageNumbers: number[],
  dpi: number,
): Promise<Array<{ page: number; png: Buffer }>> {
  const chrome = findChrome()
  if (!chrome) {
    throw new Error("No Chrome/Edge executable found for visual PDF page rendering.")
  }
  const pdfBase64 = (await fs.readFile(filePath)).toString("base64")
  const pdfjsUrl = pathToFileURL(PDFJS_MODULE_PATH).href
  const workerUrl = pathToFileURL(PDFJS_WORKER_PATH).href
  const scale = dpi / 72
  const tmpHtml = path.join(os.tmpdir(), `pi-pdf-render-${process.pid}-${Date.now()}.html`)
  await fs.writeFile(tmpHtml, "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body></body></html>", "utf8")

  const puppeteer = await import("puppeteer")
  const browser = await puppeteer.default.launch({
    executablePath: chrome,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--allow-file-access-from-files"],
  })

  try {
    const page = await browser.newPage()
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "load" })
    const dataUrls = (await page.evaluate(
      async (args: { pdfBase64: string; pdfjsUrl: string; workerUrl: string; pageNumbers: number[]; scale: number }) => {
        const pdfjs: any = await import(args.pdfjsUrl)
        pdfjs.GlobalWorkerOptions.workerSrc = args.workerUrl
        const raw = atob(args.pdfBase64)
        const bytes = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
        const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise
        const results: Array<{ page: number; dataUrl: string }> = []
        for (const pNo of args.pageNumbers) {
          if (pNo < 1 || pNo > doc.numPages) continue
          const pg = await doc.getPage(pNo)
          const vp = pg.getViewport({ scale: args.scale })
          const canvas = document.createElement("canvas")
          canvas.width = Math.ceil(vp.width)
          canvas.height = Math.ceil(vp.height)
          const ctx = canvas.getContext("2d")!
          ctx.fillStyle = "#ffffff"
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          await pg.render({ canvasContext: ctx, viewport: vp }).promise
          results.push({ page: pNo, dataUrl: canvas.toDataURL("image/png") })
        }
        return results
      },
      { pdfBase64, pdfjsUrl, workerUrl, pageNumbers, scale },
    )) as Array<{ page: number; dataUrl: string }>

    return dataUrls.map((r) => ({
      page: r.page,
      png: Buffer.from(r.dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"),
    }))
  } finally {
    await browser.close().catch(() => {})
    await fs.unlink(tmpHtml).catch(() => {})
  }
}

export default function pdfToolsExtension(pi: ExtensionAPI) {
  // ── pdf_info ───────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "pdf_info",
    label: "PDF Info & Triage",
    description:
      "Return page count and per-page triage signals (`text_length`, `image_count`, `math_density`) " +
      "for a PDF file. ALWAYS call `pdf_info` FIRST before extracting or rendering.",
    parameters: Type.Object({
      path: Type.String({ description: "Path to the PDF file (relative to vault/cwd or absolute)." }),
    }),
    async execute(_id, params) {
      const filePath = resolvePdfPath(String(params.path ?? ""))
      const { doc, task, pdfjs } = await openDocument(filePath)
      try {
        const lines: string[] = []
        let totalText = 0
        const pageSummaries: string[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          const content = await page.getTextContent()
          const text = itemsToText(content.items as unknown[])
          const ops = await page.getOperatorList()
          let imageCount = 0
          for (const fn of ops.fnArray) {
            if (fn === pdfjs.OPS.paintImageXObject) imageCount++
          }
          totalText += text.length
          const md = Math.round(mathDensity(text) * 10000) / 10000
          pageSummaries.push(`p${i}: len=${text.length} img=${imageCount} math=${md.toFixed(4)}`)
        }
        const mean = Math.round(totalText / Math.max(doc.numPages, 1))
        lines.push(`File: ${filePath}`)
        lines.push(`Pages: ${doc.numPages} (mean text length/page: ${mean})`)
        lines.push(...pageSummaries)
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { ok: true, pages: doc.numPages },
        }
      } finally {
        await task.destroy()
      }
    },
  })

  // ── pdf_extract ────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "pdf_extract",
    label: "PDF Extract Text",
    description:
      "Extract text from specified PDF pages (page spec: 'all', '1-5', '1,3,7', '3'). " +
      "Call `pdf_info` first; narrow the page spec for large documents.",
    parameters: Type.Object({
      path: Type.String({ description: "Path to the PDF file." }),
      pages: Type.String({ description: "Page spec, e.g. 'all', '1-5', '1,3,7', '3'." }),
    }),
    async execute(_id, params) {
      const filePath = resolvePdfPath(String(params.path ?? ""))
      const { doc, task } = await openDocument(filePath)
      try {
        const pages = parsePageSpec(String(params.pages ?? "all"), doc.numPages)
        if (pages.length === 0) {
          return { content: [{ type: "text", text: "No pages matched the page spec." }] }
        }
        const chunks: string[] = []
        for (const p of pages) {
          const page = await doc.getPage(p)
          const content = await page.getTextContent()
          chunks.push(`--- Page ${p} ---\n${itemsToText(content.items as unknown[])}`)
        }
        let full = chunks.join("\n\n")
        if (full.length > EXTRACT_CAP) {
          full = `${full.slice(0, EXTRACT_CAP)}\n\n[Output truncated at ${EXTRACT_CAP} chars — narrow the page spec and extract in smaller batches.]`
        }
        return {
          content: [{ type: "text", text: full }],
          details: { ok: true, pagesExtracted: pages },
        }
      } finally {
        await task.destroy()
      }
    },
  })

  // ── pdf_search ─────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "pdf_search",
    label: "PDF Search",
    description:
      "Search a PDF's text by keyword or regex (case-insensitive) across all pages; " +
      "returns matching pages and lines with surrounding context. Use on medium/long PDFs " +
      "before extracting or rendering pages.",
    parameters: Type.Object({
      path: Type.String({ description: "Path to the PDF file." }),
      query: Type.String({ description: "Keyword or regex pattern to search for." }),
      context_lines: Type.Optional(
        Type.Integer({ minimum: 0, maximum: 8, description: "Context lines around each hit (default 3)." }),
      ),
      literal: Type.Optional(
        Type.Boolean({ description: "true = treat query as a literal string rather than regex (default false)." }),
      ),
    }),
    async execute(_id, params) {
      const filePath = resolvePdfPath(String(params.path ?? ""))
      const query = String(params.query ?? "")
      const contextLines = typeof params.context_lines === "number" ? params.context_lines : 3
      const pattern = params.literal ? new RegExp(escapeRegex(query), "i") : new RegExp(query, "i")

      const { doc, task } = await openDocument(filePath)
      try {
        const hits: Array<{ page: number; line: number; context: string }> = []
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          const content = await page.getTextContent()
          const text = itemsToText(content.items as unknown[])
          const lines = text.split("\n")
          for (let ln = 0; ln < lines.length; ln++) {
            if (!pattern.test(lines[ln]!)) continue
            const start = Math.max(0, ln - contextLines)
            const end = Math.min(lines.length, ln + contextLines + 1)
            const ctx = lines
              .slice(start, end)
              .map((l, j) => `${start + j === ln ? ">>>" : "   "} ${l}`)
              .join("\n")
            hits.push({ page: i, line: ln + 1, context: ctx })
          }
        }
        const cap = hits.slice(0, 40)
        const text =
          cap.length === 0
            ? "No hits."
            : cap.map((h) => `=== Page ${h.page}, line ${h.line} ===\n${h.context}`).join("\n\n") +
              (hits.length > cap.length ? `\n\n[${hits.length - cap.length} more hits — narrow the query.]` : "")
        return {
          content: [{ type: "text", text }],
          details: { ok: true, hitCount: hits.length },
        }
      } finally {
        await task.destroy()
      }
    },
  })

  // ── pdf_render ─────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "pdf_render",
    label: "PDF Render Pages Visually",
    description:
      "Render up to 6 PDF pages to PNG images and return them inline so you can visually " +
      "read equations, diagrams, tables, and layouts that text extraction garbles. " +
      "DPI guidance: 100 for text, 150 default, 200 for dense math/small print.",
    parameters: Type.Object({
      path: Type.String({ description: "Path to the PDF file." }),
      pages: Type.String({ description: "Page spec (max 6 pages per call, e.g. '1-3' or '2,5,8')." }),
      dpi: Type.Optional(
        Type.Integer({ minimum: 72, maximum: 300, description: "Render DPI (100 text / 150 default / 200 dense)." }),
      ),
    }),
    async execute(_id, params) {
      const filePath = resolvePdfPath(String(params.path ?? ""))
      const dpi = typeof params.dpi === "number" ? params.dpi : 150
      const { doc, task } = await openDocument(filePath)
      let wanted: number[] = []
      try {
        wanted = parsePageSpec(String(params.pages ?? "1"), doc.numPages, RENDER_BATCH_CAP)
      } finally {
        await task.destroy()
      }
      if (wanted.length === 0) {
        return { content: [{ type: "text", text: "ERROR: page spec matched no pages." }] }
      }
      const rendered = await renderPagesInChrome(filePath, wanted, dpi)
      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
        {
          type: "text",
          text: `Rendered ${rendered.length} page(s) (${rendered.map((r) => `p${r.page}`).join(", ")}) at ${dpi} DPI. Inspect the images below carefully for equations, figures, and layout:`,
        },
        ...rendered.map((r) => ({
          type: "image" as const,
          data: r.png.toString("base64"),
          mimeType: "image/png",
        })),
      ]
      return {
        content,
        details: { ok: true, pagesRendered: rendered.map((r) => r.page) },
      }
    },
  })
}
