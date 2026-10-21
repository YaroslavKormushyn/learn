/**
 * md-log — mirror the session to a markdown file for comfortable reading.
 *
 * Designed for long teaching/learning sessions where the terminal is hard on
 * the eyes and markdown/math/code don't render. The linked .md file is meant
 * to be viewed rendered (e.g. in Obsidian), so assistant text with $...$ math,
 * code blocks, and markdown all render natively — no rendering work here.
 *
 * Captures only reading-relevant content:
 *   - user prompts
 *   - assistant text (lesson prose)
 *   - quiz / ask_user_question Q&A blocks
 * Other tools (bash, read, write, edit, ...) are omitted.
 *
 * Quiz/ask questions are written BEFORE the user answers (on tool_call), so the
 * reader sees the question appear live; the answer + feedback are appended on
 * tool_result. The question block NEVER contains the correct answer or
 * explanation (the user reads this file live).
 *
 * Commands:
 *   /md-log <filepath>  — Link a markdown file and backfill the session.
 *   /md-unlog           — Stop logging.
 *
 * Append-only. No send-back-to-agent functionality (that lived in the old
 * .md-link extension this was modeled on).
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";

const QA_TOOLS = new Set(["quiz", "ask_user_question"]);

export default function mdLog(pi: ExtensionAPI) {
	let logFile: string | null = null;
	let passedQuizzesSinceDistill = 0;

	function updateStatus(ctx: any) {
		if (!ctx?.ui?.setStatus) return;
		const theme = ctx.ui.theme;
		const parts: string[] = [];
		if (logFile) {
			parts.push(theme.fg("accent", "🗒 ") + theme.fg("dim", path.basename(logFile)));
		}
		if (passedQuizzesSinceDistill > 0) {
			const color = passedQuizzesSinceDistill >= 2 ? "warning" : "muted";
			parts.push(
				theme.fg(
					color,
					`🧠 ${passedQuizzesSinceDistill} node${passedQuizzesSinceDistill === 1 ? "" : "s"} un-distilled (/feynman · /distill)`,
				),
			);
		}
		ctx.ui.setStatus("md-log", parts.length > 0 ? parts.join(theme.fg("dim", "  │  ")) : undefined);
	}

	// --- State restoration on session restart ---

	pi.on("session_start", async (_event, ctx) => {
		let lastLinkData: { file: string | null } | undefined;
		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type === "custom" && entry.customType === "md-log") {
				lastLinkData = entry.data as { file: string | null } | undefined;
			}
		}
		if (lastLinkData?.file) {
			logFile = lastLinkData.file;
		}
		updateStatus(ctx);
	});

	// --- Serialization: events can fire close together; keep appends ordered ---

	let writeLock: Promise<void> = Promise.resolve();
	function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
		const prev = writeLock;
		let release: () => void;
		writeLock = new Promise<void>((r) => {
			release = r;
		});
		return prev.then(fn).finally(() => release!());
	}

	function appendToFile(text: string): void {
		if (!logFile) return;
		try {
			let current = "";
			if (fs.existsSync(logFile)) {
				current = fs.readFileSync(logFile, "utf-8");
			}
			const prefix = current.trim().length > 0 ? "\n\n" : "";
			fs.writeFileSync(logFile, current + prefix + text + "\n", "utf-8");
		} catch {
			// File may have been deleted externally; ignore.
		}
	}

	// --- Formatting ---

	function callout(type: string, title: string, bodyLines: string[]): string {
		const lines = [`> [!${type}] ${title}`];
		for (const line of bodyLines) {
			lines.push(line.length === 0 ? ">" : `> ${line}`);
		}
		return lines.join("\n");
	}

	function userBlock(text: string): string {
		return `> [!quote] YOU\n\n${text}`;
	}

	// Skill declarations (`<skill name="..." ...> ...whole SKILL.md... </skill>`)
	// are system-injected context, not user prose. Replace each with a compact
	// callout noting the skill was loaded, so the log keeps the signal without
	// the noise. Runs on already-trimmed text.
	function stripSkillBlocks(text: string): string {
		return text.replace(
			/<skill\b([^>]*)>[\s\S]*?<\/skill>/g,
			(_match, attrs: string) => {
				const name = /name="([^"]+)"/.exec(attrs)?.[1];
				return `> [!note] SKILL loaded: ${name ?? "(unknown)"}`;
			},
		);
	}

	function assistantBlock(text: string): string {
		return `> [!abstract] PI\n\n${text}`;
	}

	function optionsList(options: Array<{ label: string }>): string[] {
		return options.map((o, i) => `${i + 1}. ${o.label}`);
	}

	function questionCallout(label: string, question: string, context: string | undefined, options: Array<{ label: string }>): string {
		const body: string[] = [];
		for (const line of question.split("\n")) body.push(line);
		if (context) {
			body.push("");
			for (const line of context.split("\n")) body.push(line);
		}
		if (options.length > 0) {
			body.push("");
			body.push(...optionsList(options));
		}
		return callout("question", label, body);
	}

	function answerCalloutQuiz(details: any): string {
		const status = details?.status;
		if (status === "cancelled") {
			return callout("warning", "Quiz — cancelled", ["(user skipped)"]);
		}
		if (status === "unavailable") {
			return callout("warning", "Quiz — unavailable", [details?.message || ""]);
		}
		if (details?.askFirst) {
			const noteLines = details?.note ? String(details.note).split("\n") : ["(paused quiz to ask a question)"];
			return callout("quote", "YOU (Question before answering Quiz)", noteLines);
		}
		// "I don't know" is neither correct nor incorrect — it's a distinct signal,
		// so it never renders as a red ✗.
		const dontKnow = details?.dontKnow === true;
		const correct = details?.correct === true;
		const type = dontKnow ? "question" : correct ? "success" : "failure";
		const title = dontKnow
			? "Quiz — I don't know"
			: correct
				? "Quiz — correct ✓"
				: "Quiz — incorrect ✗";
		const body: string[] = [];

		if (dontKnow) {
			body.push("Your answer: I don't know");
		} else {
			const answers: any[] = details?.answers || [];
			const sel = answers.map((a) => `${a.index}. ${a.label}`).join(", ") || "(none)";
			body.push(`Your answer: ${sel}`);
		}

		const correctIndices: number[] = details?.correctIndices || [];
		const correctStr = correctIndices.map((i) => `${i}`).join(", ");
		body.push(`Correct answer: ${correctStr}`);

		// Optional free-text note the user typed in the always-present note field.
		// Only present (in details) when non-empty, so no guard for empty strings.
		if (details?.note) {
			body.push("");
			const noteLines = String(details.note).split("\n");
			body.push(`Note: ${noteLines[0]}`);
			for (let i = 1; i < noteLines.length; i++) body.push(noteLines[i]);
		}

		if (details?.explanation) {
			body.push("");
			for (const line of String(details.explanation).split("\n")) body.push(line);
		}
		return callout(type, title, body);
	}

	function answerCalloutAsk(details: any): string {
		const status = details?.status;
		if (status === "cancelled") {
			return callout("warning", "Question — cancelled", ["(user skipped)"]);
		}
		if (status === "unavailable") {
			return callout("warning", "Question — unavailable", [details?.message || ""]);
		}
		const answers: any[] = details?.answers || [];
		const body: string[] = answers.map((a) => {
			if (a.type === "other") return `Other: ${a.label}`;
			if (a.type === "text") return a.label;
			return `${a.index}. ${a.label}`;
		});
		if (body.length === 0) body.push("(no answer)");
		return callout("example", "Answer", body);
	}

	// --- Event handlers ---

	pi.on("message_end", async (event, _ctx) => {
		if (!logFile) return;
		const msg = event.message;
		if (!msg || !("role" in msg)) return;

		if (msg.role === "user") {
			const text = typeof msg.content === "string"
				? msg.content
				: Array.isArray(msg.content)
					? msg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n")
					: "";
			const trimmed = stripSkillBlocks(text.trim());
			if (!trimmed) return;
			await withLock(() => appendToFile(userBlock(trimmed)));
			return;
		}

		if (msg.role === "assistant") {
			const textParts = (msg.content || [])
				.filter((c: any) => c.type === "text")
				.map((c: any) => (c.text as string).trim())
				.filter((t: string) => t.length > 0);
			if (textParts.length === 0) return;
			await withLock(() => appendToFile(assistantBlock(textParts.join("\n\n"))));
			return;
		}
		// toolResult messages are handled by the tool_result event (for QA tools).
	});

	// ask_user_question never shuffles its options, so the tool_call args are
	// already the true display order — safe to write the question live, before
	// the user answers.
	pi.on("tool_call", async (event, _ctx) => {
		if (!logFile) return;
		const toolName = (event as any).toolName;
		if (toolName !== "ask_user_question") return;
		const input = (event as any).input || {};
		const question: string = input.question || "";
		const context: string | undefined = input.details?.trim() || undefined;
		const options: Array<{ label: string }> = Array.isArray(input.options) ? input.options : [];
		const block = questionCallout("Question", question, context, options);
		await withLock(() => appendToFile(block));
	});

	// quiz DOES shuffle its options inside execute(), so the tool_call args are
	// the pre-shuffle author order — NOT what the user is shown. quiz emits an
	// onUpdate() with the true (post-shuffle) order before it blocks on the
	// user's answer; wait for that instead so the logged order always matches
	// what's on screen. Guard against duplicate writes if multiple updates fire
	// for the same call.
	const loggedQuizQuestion = new Set<string>();
	pi.on("tool_execution_update", async (event, _ctx) => {
		if (!logFile) return;
		const toolName = (event as any).toolName;
		if (toolName !== "quiz") return;
		const toolCallId = (event as any).toolCallId;
		if (loggedQuizQuestion.has(toolCallId)) return;
		const shuffled = (event as any).partialResult?.details?.options as Array<{ index: number; label: string }> | undefined;
		if (!shuffled || shuffled.length === 0) return;
		loggedQuizQuestion.add(toolCallId);
		const input = (event as any).args || {};
		const question: string = input.question || "";
		const context: string | undefined = input.details?.trim() || undefined;
		const options = shuffled.map((o) => ({ label: o.label }));
		const block = questionCallout("Quiz", question, context, options);
		await withLock(() => appendToFile(block));
	});

	pi.on("tool_result", async (event, ctx) => {
		const toolName = (event as any).toolName;
		const details = (event as any).details;

		// Track un-distilled quiz progress for status-bar & notification nudges
		if (toolName === "quiz" && details?.correct === true) {
			passedQuizzesSinceDistill++;
			updateStatus(ctx);
			if (passedQuizzesSinceDistill > 0 && passedQuizzesSinceDistill % 2 === 0 && ctx?.ui?.notify) {
				ctx.ui.notify(
					`💡 ${passedQuizzesSinceDistill} quiz checkpoints passed! Ready for a quick /feynman teach-back or /distill to save to Obsidian.`,
					"info",
				);
			}
		}

		// Reset the un-distilled counter when the agent writes/edits vault memory or concept files
		if (toolName === "write" || toolName === "edit") {
			const targetPath = String((event as any).input?.path || (event as any).args?.path || "");
			if (
				targetPath.includes("LEARNER.md") ||
				targetPath.includes("concepts/") ||
				targetPath.includes("concepts\\") ||
				targetPath.includes("flashcards/") ||
				targetPath.includes("flashcards\\")
			) {
				if (passedQuizzesSinceDistill > 0) {
					passedQuizzesSinceDistill = 0;
					updateStatus(ctx);
					if (ctx?.ui?.notify) {
						ctx.ui.notify("✅ Vault updated (concepts / flashcards / LEARNER.md synced)!", "success");
					}
				}
			}
		}

		if (!logFile) return;
		if (!QA_TOOLS.has(toolName)) return;
		const block = toolName === "quiz"
			? answerCalloutQuiz(details)
			: answerCalloutAsk(details);
		await withLock(() => appendToFile(block));
	});

	// --- Shared helper to link a session log file safely ---

	function linkLogFile(filepath: string, ctx: any, shouldBackfillIfEmpty = true): { ok: boolean; resolved: string; error?: string; preservedExisting?: boolean } {
		let normalized = filepath.trim();
		if (!normalized.endsWith(".md")) normalized = `${normalized}.md`;
		if (!normalized.includes("/") && !normalized.includes("\\")) {
			normalized = path.join("sessions", normalized);
		}
		const resolved = path.isAbsolute(normalized) ? normalized : path.resolve(ctx.cwd, normalized);

		let existedWithContent = false;
		if (!fs.existsSync(resolved)) {
			try {
				fs.mkdirSync(path.dirname(resolved), { recursive: true });
				fs.writeFileSync(resolved, "", "utf-8");
			} catch (err: any) {
				return { ok: false, resolved, error: `Failed to create file: ${resolved} (${err?.message || err})` };
			}
		} else if (!fs.statSync(resolved).isFile()) {
			return { ok: false, resolved, error: `Not a file: ${resolved}` };
		} else {
			try {
				existedWithContent = fs.readFileSync(resolved, "utf-8").trim().length > 0;
			} catch {
				existedWithContent = false;
			}
		}

		const alreadyLinkedSame = logFile && path.resolve(logFile) === path.resolve(resolved);
		logFile = resolved;
		pi.appendEntry("md-log", { file: resolved });

		if (!alreadyLinkedSame) {
			if (existedWithContent) {
				// Preserve existing transcript from prior sessions / other machines!
				appendToFile("---");
			} else if (shouldBackfillIfEmpty) {
				backfill(ctx);
			}
		}

		updateStatus(ctx);
		return { ok: true, resolved, preservedExisting: existedWithContent };
	}

	// --- Tool for agent-driven session linking (/learn auto-links without manual /md-log) ---

	pi.registerTool({
		name: "link_session_log",
		label: "link_session_log",
		description:
			"Link the live Obsidian session transcript to `sessions/<topic_slug>.md` (auto-creates if new, or appends cleanly to an existing session log from a prior day/computer without overwriting).",
		parameters: Type.Object({
			topic_slug: Type.String({
				description: "Canonical English kebab-case slug or relative path (e.g. 'electricity-basics' or 'dotnet-async').",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const slug = String(params.topic_slug || "").trim();
			if (!slug) {
				return {
					content: [{ type: "text", text: "Error: topic_slug is required." }],
					isError: true,
				};
			}
			// When called by the agent mid-turn, only backfill if the file is brand-new/empty.
			const res = linkLogFile(slug, ctx, false);
			if (!res.ok) {
				return {
					content: [{ type: "text", text: res.error || "Failed to link session log." }],
					isError: true,
				};
			}
			const modeMsg = res.preservedExisting
				? "Appending to existing session transcript (prior history preserved)."
				: "Created new session transcript.";
			return {
				content: [{ type: "text", text: `Linked live session log: ${res.resolved}. ${modeMsg}` }],
			};
		},
	});

	// --- Commands ---

	pi.registerCommand("md-log", {
		description: "Mirror the session to a markdown file in sessions/ (pick from list if no arg)",
		handler: async (args, ctx: any) => {
			let filepath = args.trim();
			if (typeof ctx.isIdle === "function" && !ctx.isIdle()) {
				ctx.ui.notify("Wait for the agent to finish before linking.", "warning");
				return;
			}

			// If no argument was passed, offer an interactive picker of existing `sessions/*.md` files
			if (!filepath) {
				const sessionsDir = path.resolve(ctx.cwd, "sessions");
				let existingFiles: string[] = [];
				if (fs.existsSync(sessionsDir) && fs.statSync(sessionsDir).isDirectory()) {
					existingFiles = fs
						.readdirSync(sessionsDir)
						.filter((f) => f.endsWith(".md"))
						.sort((a, b) => {
							const sa = fs.statSync(path.join(sessionsDir, a)).mtimeMs;
							const sb = fs.statSync(path.join(sessionsDir, b)).mtimeMs;
							return sb - sa;
						});
				}
				if (existingFiles.length > 0 && typeof ctx.ui?.select === "function") {
					const CREATE_NEW = "➕ Create new session log...";
					const choice = await ctx.ui.select("Select a session log to link (or create new):", [
						...existingFiles.map((f) => `sessions/${f}`),
						CREATE_NEW,
					]);
					if (!choice) return;
					if (choice === CREATE_NEW) {
						if (typeof ctx.ui?.input === "function") {
							const name = await ctx.ui.input("New topic slug (e.g. electricity-basics):");
							if (!name?.trim()) return;
							filepath = name.trim();
						} else {
							ctx.ui.notify("Usage: /md-log <topic-slug>", "warning");
							return;
						}
					} else {
						filepath = choice;
					}
				} else {
					ctx.ui.notify("Usage: /md-log <topic-slug>", "warning");
					return;
				}
			}

			const res = linkLogFile(filepath, ctx, true);
			if (!res.ok) {
				ctx.ui.notify(res.error || "Failed to link file", "error");
				return;
			}
			ctx.ui.notify(
				`Linked: ${res.resolved}${res.preservedExisting ? " (existing transcript preserved)" : ""}`,
				"success",
			);
		},
	});

	pi.registerCommand("md-unlog", {
		description: "Stop mirroring the session to a markdown file",
		handler: async (_args, ctx) => {
			if (!logFile) {
				ctx.ui.notify("No file linked", "warning");
				return;
			}
			const name = path.basename(logFile);
			logFile = null;
			pi.appendEntry("md-log", { file: null });
			updateStatus(ctx);
			ctx.ui.notify(`Unlinked: ${name}`, "info");
		},
	});

	// --- Backfill ---

	function backfill(ctx: any): number {
		if (!logFile) return 0;
		const entries: any[] = ctx.sessionManager.getEntries();
		if (entries.length === 0) return 0;

		const byId = new Map<string, any>();
		for (const e of entries) if (e.id) byId.set(e.id, e);

		// Active leaf = last entry that has an id (skip the session header).
		let leaf: any = null;
		for (let i = entries.length - 1; i >= 0; i--) {
			if (entries[i].id) {
				leaf = entries[i];
				break;
			}
		}
		if (!leaf) return 0;

		// Walk parent chain to root.
		const chain: any[] = [];
		let cur: any = leaf;
		const seen = new Set<string>();
		while (cur && cur.id && !seen.has(cur.id)) {
			seen.add(cur.id);
			chain.push(cur);
			cur = cur.parentId ? byId.get(cur.parentId) : null;
		}
		chain.reverse();

		// Track tool-call args from assistant messages so we can pair with results.
		const toolCallArgs = new Map<string, { name: string; args: any }>();

		const blocks: string[] = [];
		let count = 0;
		for (const entry of chain) {
			if (entry.type !== "message") continue;
			const msg = entry.message;
			if (!msg || !("role" in msg)) continue;
			count++;

			if (msg.role === "user") {
				const text = typeof msg.content === "string"
					? msg.content
					: Array.isArray(msg.content)
						? msg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n")
						: "";
				const trimmed = stripSkillBlocks(text.trim());
				if (trimmed) blocks.push(userBlock(trimmed));
				continue;
			}

			if (msg.role === "assistant") {
				// Index tool calls for later pairing.
				for (const c of msg.content || []) {
					if (c.type === "toolCall" && QA_TOOLS.has(c.name)) {
						toolCallArgs.set(c.id, { name: c.name, args: c.arguments });
					}
				}
				const textParts = (msg.content || [])
					.filter((c: any) => c.type === "text")
					.map((c: any) => (c.text as string).trim())
					.filter((t: string) => t.length > 0);
				if (textParts.length > 0) blocks.push(assistantBlock(textParts.join("\n\n")));
				continue;
			}

			if (msg.role === "toolResult") {
				if (!QA_TOOLS.has(msg.toolName)) continue;
				const tc = toolCallArgs.get(msg.toolCallId);
				// Question block. For quiz, use the persisted result's `details.options`
				// — the TRUE post-shuffle display order the user actually saw — rather
				// than the original tool-call args, which are the pre-shuffle author
				// order and can mismatch what's on screen. ask_user_question never
				// shuffles, so its tool-call args are already the true order.
				if (tc) {
					const a = tc.args || {};
					const label = tc.name === "quiz" ? "Quiz" : "Question";
					const shuffled = msg.toolName === "quiz"
						? (msg.details?.options as Array<{ index: number; label: string }> | undefined)
						: undefined;
					const options = shuffled && shuffled.length > 0
						? shuffled.map((o) => ({ label: o.label }))
						: (Array.isArray(a.options) ? a.options : []);
					blocks.push(questionCallout(label, a.question || "", a.details?.trim() || undefined, options));
				}
				if (msg.toolName === "quiz") {
					blocks.push(answerCalloutQuiz(msg.details));
				} else {
					blocks.push(answerCalloutAsk(msg.details));
				}
				continue;
			}
		}

		if (blocks.length > 0) {
			try {
				fs.writeFileSync(logFile, blocks.join("\n\n") + "\n", "utf-8");
			} catch {
				// ignore
			}
		}
		return count;
	}
}
