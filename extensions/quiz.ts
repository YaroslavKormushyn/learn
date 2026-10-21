import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	Text,
	matchesKey,
	truncateToWidth,
	wrapTextWithAnsi,
} from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// ────────────────────────────────────────────────────────────────────────────
// quiz — a GRADED sibling of ask_user_question.
//
// Where ask_user_question collects a preference/decision with no notion of
// right or wrong, `quiz` poses a question that HAS a correct answer, grades the
// user's selection instantly, and shows tight feedback (✓/✗ + the correct
// answer + an optional explanation) to both the user and the agent.
//
// It is intentionally options-only: single-select or multi-select. There is no
// free-text mode and no "Other" option, because a free-text answer can't be
// graded against a correct index.
// ────────────────────────────────────────────────────────────────────────────

interface QuizOption {
	label: string;
	value: string;
	description?: string;
}

interface DisplayOption extends QuizOption {
	id: string;
	index: number;
	isSubmit?: boolean;
	isAskFirst?: boolean;
}

interface OptionAnswer {
	label: string;
	value: string;
	index: number; // 1-based, matches the number shown to the user
}

// The always-present "I don't know" choice. It is NOT a real option: it never
// participates in shuffling, has no correct-answer value, and produces a
// distinct signal (dontKnow) rather than a right/wrong grade — so an honest
// "I don't know" is never confused with a lucky or unlucky guess.
const DONT_KNOW_VALUE = "__dont_know__";
const DONT_KNOW_LABEL = "I don't know";
const DONT_KNOW_INDEX = 0; // real options are 1-based; submit uses -1
const ASK_FIRST_VALUE = "__ask_first__";
const ASK_FIRST_LABEL = "Ask a question first (pause quiz)";
const ASK_FIRST_INDEX = -2;

// Unified response from either ask* component. answers holds the real
// selections (empty when dontKnow); note is the optional free-text the user
// typed in the always-present note field (kept only when non-empty).
interface QuizResponse {
	dontKnow: boolean;
	askFirst?: boolean;
	note?: string;
	answers: OptionAnswer[];
}

type QuizStatus = "answered" | "cancelled" | "unavailable";
type QuizMode = "single-select" | "multi-select";

interface DisplayedOption {
	index: number; // 1-based, in the final (possibly shuffled) display order
	label: string;
}

interface QuizResultDetails {
	status: QuizStatus;
	question: string;
	context?: string;
	mode: QuizMode;
	answers: OptionAnswer[];
	correctIndices: number[];
	options?: DisplayedOption[]; // full option list in display order, for the transcript
	correct?: boolean;
	dontKnow?: boolean; // user selected "I don't know" instead of guessing
	askFirst?: boolean; // user paused the quiz to ask a question first without spoiling the answer
	note?: string; // optional free-text from the always-present note field (any answer)
	explanation?: string;
	message?: string;
}

const OptionSchema = Type.Object({
	label: Type.String({ description: "Display label for the answer option." }),
	value: Type.Optional(
		Type.String({ description: "Optional machine-readable value returned for the option. Defaults to the label." }),
	),
	description: Type.Optional(Type.String({ description: "Optional extra detail shown below the option." })),
});

const QuizParams = Type.Object({
	question: Type.String({
		description: "The single quiz question to ask. Ask exactly one question per tool call.",
	}),
	details: Type.Optional(
		Type.String({ description: "Optional extra context or instructions shown under the question." }),
	),
	options: Type.Array(OptionSchema, {
		description:
			"The answer options (2 or more). Options only — there is no free-text mode. Give each option a stable `value`; you reference the correct one by that value in correctAnswer.",
		minItems: 2,
	}),
	multiSelect: Type.Optional(
		Type.Boolean({ description: "Set to true when more than one option is correct and the user must select all of them." }),
	),
	correctAnswer: Type.Union([Type.String(), Type.Array(Type.String())], {
		description:
			'REQUIRED. The correct answer as the option value(s) — the `value` field of the option you intend. Single-select: a single string (e.g. "mercury"). Multi-select: an array of strings (e.g. ["belize", "niue"]); the user is only correct if their selection matches this set exactly. Always pass the value, not a position number — this is self-checking and prevents miscounting.',
	}),
	explanation: Type.String({
		description:
			"REQUIRED. Explanation revealed AFTER the user answers (shown whether they got it right or wrong). Use it to reinforce why the correct answer is correct.",
	}),
	shuffle: Type.Optional(
		Type.Boolean({
			description:
				"Defaults to true: options are randomly reordered before display so the correct answer isn't always in the same position. Set to false only when option order is meaningful (e.g. ordered numeric values, or an 'All/None of the above' option that must stay last).",
		}),
	),
});

function normalizeOptions(
	options: Array<{ label: string; value?: string; description?: string }> | undefined,
): QuizOption[] {
	const seen = new Set<string>();
	return (options || [])
		.map((option) => ({
			label: option.label.trim(),
			value: option.value?.trim() || option.label.trim(),
			description: option.description?.trim() || undefined,
		}))
		.filter((option) => {
			if (option.label.length === 0) return false;
			if (seen.has(option.value)) throw new Error(`duplicate option value "${option.value}"`);
			seen.add(option.value);
			return true;
		});
}

// Fisher-Yates shuffle over a copy. Safe to reorder for display because
// correctAnswer is keyed by value, not position — indices are resolved AFTER
// shuffling, so grading always matches what the user actually sees.
function shuffleOptions(options: QuizOption[]): QuizOption[] {
	const out = [...options];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

// Resolve author-supplied option value(s) to 1-based indices. Keying by value
// (not position) makes the correct answer self-documenting: the author writes
// `correctAnswer: "mercury"` and a typo becomes a hard error instead of a
// silent wrong grade.
// The harness sometimes delivers a multi-select `correctAnswer` array as a
// JSON-stringified string (e.g. '["a", "b"]') instead of a real array, because
// the schema union lists String first. Detect that case and parse it back into
// an array so grading resolves against real option values. A plain single value
// is wrapped as-is.
function coerceCorrectAnswer(correctAnswer: string | string[]): string[] {
	if (Array.isArray(correctAnswer)) return correctAnswer;
	const trimmed = correctAnswer.trim();
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) return parsed.map((v) => String(v));
		} catch {
			// Not valid JSON — fall through and treat as a single literal value.
		}
	}
	return [correctAnswer];
}

function resolveCorrect(
	correctAnswer: string | string[] | undefined,
	options: QuizOption[],
): { indices: number[]; error?: string } {
	if (correctAnswer === undefined) return { indices: [], error: "correctAnswer is required" };
	const arr = coerceCorrectAnswer(correctAnswer);
	if (arr.length === 0) return { indices: [], error: "correctAnswer is required" };
	const byValue = new Map(options.map((o, i) => [o.value, i + 1]));
	const indices: number[] = [];
	for (const raw of arr) {
		const v = typeof raw === "string" ? raw.trim() : raw;
		const idx = byValue.get(v);
		if (idx === undefined) {
			const known = options.map((o) => `"${o.value}"`).join(", ");
			return { indices: [], error: `correctAnswer "${v}" does not match any option value (${known})` };
		}
		indices.push(idx);
	}
	return { indices: Array.from(new Set(indices)).sort((a, b) => a - b) };
}

function createEditorTheme(theme: any): EditorTheme {
	return {
		borderColor: (s) => theme.fg("accent", s),
		selectList: {
			selectedPrefix: (t) => theme.fg("accent", t),
			selectedText: (t) => theme.fg("accent", t),
			description: (t) => theme.fg("muted", t),
			scrollInfo: (t) => theme.fg("dim", t),
			noMatch: (t) => theme.fg("warning", t),
		},
	};
}

const SUPERSCRIPTS: Record<string, string> = {
	"0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
	"5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
	"+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
	"n": "ⁿ", "i": "ⁱ", "T": "ᵀ", "°": "°",
};

const SUBSCRIPTS: Record<string, string> = {
	"0": "₀", "1": "₁", "2": "₂", "3": "³", "4": "₄",
	"5": "₅", "6": "⁶", "7": "₇", "8": "₈", "9": "₉",
	"+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
	"a": "ₐ", "e": "ₑ", "h": "ₕ", "i": "ᵢ", "j": "ⱼ",
	"k": "ₖ", "l": "ₗ", "m": "ₘ", "n": "ₙ", "o": "ₒ",
	"p": "ₚ", "r": "ᵣ", "s": "ₛ", "t": "ₜ", "u": "ᵤ",
	"v": "ᵥ", "x": "ₓ",
};
SUBSCRIPTS["3"] = "₃";
SUBSCRIPTS["6"] = "₆";

const LATEX_SYMBOLS: Record<string, string> = {
	alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε",
	zeta: "ζ", eta: "η", theta: "θ", vartheta: "θ", iota: "ι", kappa: "κ",
	lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", varrho: "ρ",
	sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ",
	chi: "χ", psi: "ψ", omega: "ω",
	Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
	Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
	cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", ast: "∗", star: "⋆",
	approx: "≈", neq: "≠", ne: "≠", leq: "≤", le: "≤", geq: "≥", ge: "≥",
	ll: "≪", gg: "≫", equiv: "≡", sim: "∼", simeq: "≃", propto: "∝",
	rightarrow: "→", to: "→", leftarrow: "←", gets: "←", leftrightarrow: "↔",
	Rightarrow: "⇒", implies: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔", iff: "⇔",
	mapsto: "↦", uparrow: "↑", downarrow: "↓",
	infty: "∞", partial: "∂", nabla: "∇", forall: "∀", exists: "∃", nexists: "∄",
	emptyset: "∅", varnothing: "∅", in: "∈", notin: "∉", ni: "∋",
	subset: "⊂", supset: "⊃", subseteq: "⊆", supseteq: "⊇",
	cup: "∪", cap: "∩", setminus: "∖",
	land: "∧", lor: "∨", lnot: "¬", neg: "¬",
	int: "∫", iint: "∬", iiint: "∭", oint: "∮", sum: "∑", prod: "∏",
	aleph: "ℵ", hbar: "ℏ", ell: "ℓ", Re: "ℜ", Im: "ℑ",
	angle: "∠", perp: "⊥", parallel: "∥", triangle: "△",
	circ: "°", degree: "°", prime: "′", ldots: "…", cdots: "⋯", dots: "…",
};

function convertMathBody(math: string): string {
	let s = math;
	s = s.replace(/\{,\}/g, ",");
	s = s.replace(/\\(?:left|right)\s*([()[\]|.]|\\\{|\\\})/g, (_m, d: string) =>
		d === "." ? "" : d.replace(/^\\/, ""),
	);
	s = s.replace(/\\(?:left|right)\b/g, "");
	for (let i = 0; i < 3; i++) {
		s = s.replace(
			/\\(?:text|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|mathbb|operatorname)\s*\{([^{}]*)\}/g,
			"$1",
		);
	}
	for (let i = 0; i < 3; i++) {
		s = s.replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, num: string, den: string) => {
			const n = convertMathBody(num).trim();
			const d = convertMathBody(den).trim();
			const nWrap = /^[A-Za-z0-9α-ωΑ-Ω°.,]+$/.test(n) ? n : `(${n})`;
			const dWrap = /^[A-Za-z0-9α-ωΑ-Ω°.,]+$/.test(d) ? d : `(${d})`;
			return `${nWrap}/${dWrap}`;
		});
	}
	s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_m, inner: string) => {
		const c = convertMathBody(inner).trim();
		return /^[A-Za-z0-9α-ωΑ-Ω]+$/.test(c) ? `√${c}` : `√(${c})`;
	});
	s = s.replace(/\\(?:quad|qquad)\b/g, "  ");
	s = s.replace(/\\[,;: ]/g, " ");
	s = s.replace(/\\!/g, "");
	s = s.replace(/\\([A-Za-z]+)\b/g, (_m, cmd: string) => (cmd in LATEX_SYMBOLS ? LATEX_SYMBOLS[cmd] : cmd));
	s = s.replace(/\^\s*\{([^{}]+)\}/g, (_m, exp: string) => {
		const clean = convertMathBody(exp).trim();
		const chars = [...clean];
		if (chars.length > 0 && chars.every((c) => c in SUPERSCRIPTS)) {
			return chars.map((c) => SUPERSCRIPTS[c]).join("");
		}
		return `^(${clean})`;
	});
	s = s.replace(/\^([0-9+\-=niT°])/g, (_m, ch: string) => SUPERSCRIPTS[ch] || `^${ch}`);
	s = s.replace(/_\s*\{([^{}]+)\}/g, (_m, sub: string) => {
		const clean = convertMathBody(sub).trim();
		const chars = [...clean];
		if (chars.length > 0 && chars.every((c) => c in SUBSCRIPTS)) {
			return chars.map((c) => SUBSCRIPTS[c]).join("");
		}
		return `_${clean}`;
	});
	s = s.replace(/_([0-9+\-=aehijklmnoprstuvx])/g, (_m, ch: string) => SUBSCRIPTS[ch] || `_${ch}`);
	s = s.replace(/\\([{}%&#_$])/g, "$1");
	s = s.replace(/[{}]/g, "");
	return s;
}

/**
 * Convert inline ($...$) and display ($$...$$) LaTeX math into clean Unicode
 * for terminal display only. Leaves the underlying option/explanation data
 * untouched so md-log still writes raw LaTeX to Obsidian.
 */
function renderTerminalMath(text: string): string {
	if (!text) return text;
	let out = text.replace(/\$\$([\s\S]*?)\$\$/g, (_m, body: string) => convertMathBody(body.trim()));
	out = out.replace(/\$([^\n$]+?)\$/g, (_m, body: string) => convertMathBody(body));
	return out;
}

function addWrapped(lines: string[], text: string, width: number, indent = ""): void {
	const contentWidth = Math.max(1, width - indent.length);
	for (const line of wrapTextWithAnsi(text, contentWidth)) {
		lines.push(truncateToWidth(`${indent}${line}`, width));
	}
}

function addOptionWrapped(
	lines: string[],
	prefix: string,
	continuationIndent: string,
	styledBody: string,
	width: number,
): void {
	const contentWidth = Math.max(1, width - continuationIndent.length);
	const wrapped = wrapTextWithAnsi(styledBody, contentWidth);
	for (let i = 0; i < wrapped.length; i++) {
		const lead = i === 0 ? prefix : continuationIndent;
		lines.push(truncateToWidth(`${lead}${wrapped[i]}`, width));
	}
}

function isCorrect(selectedIndices: number[], correctIndices: number[]): boolean {
	if (selectedIndices.length !== correctIndices.length) return false;
	const a = [...selectedIndices].sort((x, y) => x - y);
	const b = [...correctIndices].sort((x, y) => x - y);
	return a.every((v, i) => v === b[i]);
}

function buildStructuredResult(
	status: QuizStatus,
	question: string,
	mode: QuizMode,
	answers: OptionAnswer[],
	correctIndices: number[],
	correct: boolean | undefined,
	explanation: string | undefined,
	context?: string,
	message?: string,
	options?: DisplayedOption[],
	dontKnow?: boolean,
	note?: string,
	askFirst?: boolean,
): QuizResultDetails {
	return {
		status,
		question,
		context,
		mode,
		answers,
		correctIndices,
		options,
		correct,
		dontKnow,
		askFirst,
		note,
		explanation,
		message,
	};
}

function cancelledResult(question: string, mode: QuizMode, correctIndices: number[], context?: string) {
	const message = "User cancelled the quiz";
	return {
		content: [{ type: "text" as const, text: message }],
		details: buildStructuredResult("cancelled", question, mode, [], correctIndices, undefined, undefined, context, message),
	};
}

function unavailableResult(question: string, mode: QuizMode, message: string, correctIndices: number[], context?: string) {
	return {
		content: [{ type: "text" as const, text: message }],
		details: buildStructuredResult("unavailable", question, mode, [], correctIndices, undefined, undefined, context, message),
	};
}

function formatOptionRef(options: QuizOption[], index: number): string {
	const opt = options.find((o, i) => i + 1 === index);
	return `${index}. ${opt ? opt.label : "(unknown)"}`;
}

function formatTerminalOptionRef(options: QuizOption[], index: number): string {
	const opt = options.find((o, i) => i + 1 === index);
	return `${index}. ${opt ? renderTerminalMath(opt.label) : "(unknown)"}`;
}

function buildResult(
	question: string,
	context: string | undefined,
	mode: QuizMode,
	options: QuizOption[],
	response: QuizResponse,
	correctIndices: number[],
	explanation: string | undefined,
) {
	const { dontKnow, askFirst, note, answers } = response;
	const displayedOptions: DisplayedOption[] = options.map((o, i) => ({ index: i + 1, label: o.label }));

	if (askFirst) {
		const qText = note || "(User paused the quiz to ask a clarifying question)";
		const text = `User paused the quiz to ask a clarifying question BEFORE answering (do NOT reveal or spoil the correct quiz answer yet — answer their question thoroughly first, and then re-run this quiz):\nUser's question: ${qText}`;
		return {
			content: [{ type: "text" as const, text }],
			details: buildStructuredResult(
				"answered",
				question,
				mode,
				[],
				correctIndices,
				undefined,
				undefined,
				context,
				undefined,
				displayedOptions,
				false,
				note,
				true,
			),
		};
	}

	const selectedIndices = answers.map((a) => a.index);
	// "I don't know" is never counted as correct — it's a distinct outcome.
	const correct = dontKnow ? false : isCorrect(selectedIndices, correctIndices);
	const correctStr = correctIndices.map((i) => formatOptionRef(options, i)).join(", ");

	let text: string;
	if (dontKnow) {
		// Make the signal explicit for the agent: the user did NOT guess, so this
		// is a genuine knowledge gap, not a wrong answer to correct against.
		text = `User selected "I don't know" — they did not attempt an answer (a genuine knowledge gap, not a wrong guess).`;
		text += `\nCorrect: ${correctStr}`;
		if (note) text += `\nUser's note: ${note}`;
	} else {
		const verdict = correct ? "correctly" : "incorrectly";
		const selectedStr = answers.map((a) => `${a.index}. ${a.label}`).join(", ");
		text = `User answered ${verdict}.\nSelected: ${selectedStr}\nCorrect: ${correctStr}`;
		if (note) text += `\nUser's note: ${note}`;
	}
	if (explanation) text += `\nExplanation: ${explanation}`;

	return {
		content: [{ type: "text" as const, text }],
		details: buildStructuredResult(
			"answered",
			question,
			mode,
			answers,
			correctIndices,
			correct,
			explanation,
			context,
			undefined,
			displayedOptions,
			dontKnow,
			note,
			false,
		),
	};
}

// Shared feedback block, rendered after the user submits.
function renderFeedback(
	lines: string[],
	theme: any,
	width: number,
	options: QuizOption[],
	selectedIndices: number[],
	correctIndices: number[],
	explanation: string | undefined,
	dontKnow = false,
	note?: string,
): void {
	const add = (text: string) => lines.push(truncateToWidth(text, width));
	const correct = !dontKnow && isCorrect(selectedIndices, correctIndices);
	const selectedSet = new Set(selectedIndices);
	const correctSet = new Set(correctIndices);

	lines.push("");
	for (let i = 0; i < options.length; i++) {
		const index = i + 1;
		const opt = options[i];
		const isSelected = selectedSet.has(index);
		const isKey = correctSet.has(index);
		let marker: string;
		let color: string;
		if (dontKnow) {
			// No guess was made — only reveal the correct answer(s); never show ✗.
			marker = isKey ? "✓" : " ";
			color = isKey ? "success" : "dim";
		} else if (isSelected && isKey) {
			marker = "✓";
			color = "success";
		} else if (isSelected && !isKey) {
			marker = "✗";
			color = "error";
		} else if (!isSelected && isKey) {
			// correct answer the user missed
			marker = "✓";
			color = "success";
		} else {
			marker = " ";
			color = "dim";
		}
		addOptionWrapped(
			lines,
			theme.fg(color, ` ${marker} `),
			"   ",
			theme.fg(color, `${index}. ${renderTerminalMath(opt.label)}`),
			width,
		);
	}

	lines.push("");
	if (dontKnow) {
		add(theme.fg("warning", " · You said: I don't know"));
		const correctStr = correctIndices.map((i) => formatTerminalOptionRef(options, i)).join(", ");
		addWrapped(lines, theme.fg("muted", `Correct answer: ${correctStr}`), width, " ");
	} else if (correct) {
		add(theme.fg("success", " ✓ Correct!"));
	} else {
		add(theme.fg("error", " ✗ Incorrect."));
		const correctStr = correctIndices.map((i) => formatTerminalOptionRef(options, i)).join(", ");
		addWrapped(lines, theme.fg("muted", `Correct answer: ${correctStr}`), width, " ");
	}
	if (note) {
		addWrapped(lines, theme.fg("muted", `Your note: ${renderTerminalMath(note)}`), width, " ");
	}
	if (explanation) {
		lines.push("");
		addWrapped(lines, theme.fg("text", renderTerminalMath(explanation)), width, " ");
	}
	lines.push("");
	add(theme.fg("dim", " Enter/Esc to continue"));
}

// Top border + question + optional context. Shared by both components.
function pushHeader(lines: string[], theme: any, width: number, question: string, context: string | undefined): void {
	lines.push(truncateToWidth(theme.fg("accent", "─".repeat(width)), width));
	addWrapped(lines, theme.fg("text", renderTerminalMath(question)), width, " ");
	if (context) {
		lines.push("");
		addWrapped(lines, theme.fg("muted", renderTerminalMath(context)), width, " ");
	}
}

// The "I don't know" and "Ask a question first" rows in the selection list —
// visually separated and dimmed so they read as distinct from the real, gradable options.
function pushDontKnowRow(lines: string[], theme: any, width: number, focused: boolean): void {
	lines.push("");
	const prefix = focused ? theme.fg("accent", "> ") : "  ";
	const styled = focused ? theme.fg("accent", DONT_KNOW_LABEL) : theme.fg("dim", DONT_KNOW_LABEL);
	lines.push(truncateToWidth(`${prefix}${styled}`, width));
}

function pushAskFirstRow(lines: string[], theme: any, width: number, focused: boolean): void {
	const prefix = focused ? theme.fg("accent", "> ") : "  ";
	const styled = focused ? theme.fg("accent", ASK_FIRST_LABEL) : theme.fg("dim", ASK_FIRST_LABEL);
	lines.push(truncateToWidth(`${prefix}${styled}`, width));
}

// Persistent, always-present note field rendered under the options during the
// select phase. Applies to ANY answer (including "I don't know" or "Ask a question first")
// and is only surfaced to the agent when non-empty.
function pushNoteField(
	lines: string[],
	theme: any,
	width: number,
	editor: Editor,
	focused: boolean,
	askFirstMode = false,
): void {
	lines.push("");
	const titleText = askFirstMode
		? "Your question (press Enter to send & pause quiz):"
		: "Note / side question (optional — ↓ or Tab to focus):";
	const label = focused ? theme.fg("accent", titleText) : theme.fg("muted", titleText);
	addWrapped(lines, label, width, " ");
	for (const line of editor.render(width)) lines.push(line);
}

// Build the note Editor. `disableSubmit` is set because Enter must NOT submit
// here: the editor's submit path clears the buffer, which would wipe the note.
// Instead the host intercepts Enter to return focus to the options while
// keeping the text. Ctrl+J still inserts a newline (pi convention), so
// multi-line notes work.
function makeNoteEditor(tui: any, theme: any): Editor {
	const editor = new Editor(tui, createEditorTheme(theme));
	editor.focused = false;
	editor.disableSubmit = true;
	return editor;
}

async function askSingleChoice(
	ctx: any,
	question: string,
	context: string | undefined,
	options: QuizOption[],
	correctIndices: number[],
	explanation: string | undefined,
): Promise<QuizResponse | null> {
	const allOptions: DisplayOption[] = options.map((option, index) => ({
		...option,
		id: `option:${index}`,
		index: index + 1,
	}));
	const dontKnowNav = allOptions.length; // nav index of the "I don't know" row
	const askFirstNav = allOptions.length + 1; // nav index of the "Ask a question first" row

	return ctx.ui.custom<QuizResponse | null>(
		(tui: any, theme: any, _kb: any, done: (result: QuizResponse | null) => void) => {
			let optionIndex = 0;
			let phase: "select" | "feedback" = "select";
			let focus: "options" | "note" = "options";
			let askFirstMode = false;
			let chosen: OptionAnswer | null = null;
			let dontKnow = false;
			const editor = makeNoteEditor(tui, theme);
			let cachedLines: string[] | undefined;
			let cachedWidth = -1;

			function refresh() {
				cachedLines = undefined;
				tui.requestRender();
			}

			function noteText(): string | undefined {
				const t = editor.getText().trim();
				return t.length ? t : undefined;
			}

			function toOptions() {
				focus = "options";
				askFirstMode = false;
				editor.focused = false;
				refresh();
			}

			function toNote(forAskFirst = false) {
				focus = "note";
				askFirstMode = forAskFirst;
				editor.focused = true;
				refresh();
			}

			function response(): QuizResponse {
				const note = noteText();
				return dontKnow
					? { dontKnow: true, note, answers: [] }
					: { dontKnow: false, note, answers: chosen ? [chosen] : [] };
			}

			function handleInput(data: string) {
				if (phase === "feedback") {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
						done(response());
					}
					return;
				}

				// Tab toggles focus between the options list and the note field.
				if (matchesKey(data, Key.tab)) {
					if (focus === "options") {
						toNote(optionIndex === askFirstNav);
					} else {
						toOptions();
					}
					return;
				}

				if (focus === "note") {
					// Up arrow from the note field moves focus back up to the bottom option row.
					if (matchesKey(data, Key.up)) {
						optionIndex = askFirstNav;
						toOptions();
						return;
					}
					if (matchesKey(data, Key.escape)) {
						toOptions();
						return;
					}
					if (matchesKey(data, Key.enter)) {
						// If the user entered the note field via "Ask a question first" (or while it's selected),
						// pressing Enter with a non-empty question sends it immediately without spoiling the quiz.
						if (askFirstMode && noteText()) {
							done({ dontKnow: false, askFirst: true, note: noteText(), answers: [] });
							return;
						}
						toOptions();
						return;
					}
					editor.handleInput(data);
					tui.requestRender();
					return;
				}

				// focus === "options"
				if (matchesKey(data, Key.up)) {
					optionIndex = Math.max(0, optionIndex - 1);
					refresh();
					return;
				}
				if (matchesKey(data, Key.down)) {
					if (optionIndex < askFirstNav) {
						optionIndex++;
						refresh();
					} else {
						// Pressing Down past the last row jumps directly into the Note field!
						toNote(false);
					}
					return;
				}
				if (matchesKey(data, Key.enter)) {
					if (optionIndex === askFirstNav) {
						const existingNote = noteText();
						if (existingNote) {
							done({ dontKnow: false, askFirst: true, note: existingNote, answers: [] });
						} else {
							toNote(true);
						}
						return;
					}
					if (optionIndex === dontKnowNav) {
						dontKnow = true;
						chosen = null;
					} else {
						const selected = allOptions[optionIndex];
						chosen = { label: selected.label, value: selected.value, index: selected.index };
						dontKnow = false;
					}
					phase = "feedback";
					refresh();
					return;
				}
				if (matchesKey(data, Key.escape)) {
					done(null);
				}
			}

			function render(width: number): string[] {
				// The cache MUST be keyed on width: pi-tui calls requestRender() but NOT
				// invalidate() on terminal resize, so render() can be re-entered with a
				// new width. Returning stale wider lines trips the TUI width guard and
				// crashes the process.
				if (cachedLines && cachedWidth === width) return cachedLines;

				const lines: string[] = [];
				const add = (text: string) => lines.push(truncateToWidth(text, width));
				pushHeader(lines, theme, width, question, context);

				if (phase === "feedback") {
					renderFeedback(
						lines,
						theme,
						width,
						options,
						chosen ? [chosen.index] : [],
						correctIndices,
						explanation,
						dontKnow,
						noteText(),
					);
					add(theme.fg("accent", "─".repeat(width)));
					cachedLines = lines;
					cachedWidth = width;
					return lines;
				}

				lines.push("");
				for (let i = 0; i < allOptions.length; i++) {
					const option = allOptions[i];
					const selected = focus === "options" && i === optionIndex;
					const prefix = selected ? theme.fg("accent", "> ") : "  ";
					const label = `${option.index}. ${renderTerminalMath(option.label)}`;
					const styled = selected ? theme.fg("accent", label) : theme.fg("text", label);
					addOptionWrapped(lines, prefix, "  ", styled, width);
					if (option.description) {
						addWrapped(lines, theme.fg("muted", renderTerminalMath(option.description)), width, "     ");
					}
				}

				pushDontKnowRow(lines, theme, width, focus === "options" && optionIndex === dontKnowNav);
				pushAskFirstRow(lines, theme, width, focus === "options" && optionIndex === askFirstNav);

				pushNoteField(lines, theme, width, editor, focus === "note", askFirstMode);

				lines.push("");
				if (focus === "note") {
					const enterHint = askFirstMode ? "Enter send question" : "Enter/↑ back to options";
					add(theme.fg("dim", ` Type text • Ctrl+J newline • ${enterHint} • Tab/Esc back`));
				} else {
					add(theme.fg("dim", " ↑↓ navigate (↓ into Note) • Enter select • Tab note • Esc cancel"));
				}
				add(theme.fg("accent", "─".repeat(width)));
				// Not cached when the note is focused: the editor renders a live cursor.
				if (focus !== "note") {
					cachedLines = lines;
					cachedWidth = width;
				}
				return lines;
			}

			return {
				render,
				invalidate: () => {
					cachedLines = undefined;
					editor.invalidate();
				},
				handleInput,
			};
		},
	);
}

async function askMultiChoice(
	ctx: any,
	question: string,
	context: string | undefined,
	options: QuizOption[],
	correctIndices: number[],
	explanation: string | undefined,
): Promise<QuizResponse | null> {
	const DONT_KNOW_ID = "dont-know";
	const ASK_FIRST_ID = "ask-first";
	const choiceItems: DisplayOption[] = options.map((option, index) => ({
		...option,
		id: `option:${index}`,
		index: index + 1,
	}));
	const dontKnowItem: DisplayOption = {
		id: DONT_KNOW_ID,
		label: DONT_KNOW_LABEL,
		value: DONT_KNOW_VALUE,
		index: DONT_KNOW_INDEX,
	};
	const askFirstItem: DisplayOption = {
		id: ASK_FIRST_ID,
		label: ASK_FIRST_LABEL,
		value: ASK_FIRST_VALUE,
		index: ASK_FIRST_INDEX,
		isAskFirst: true,
	};
	const submitItem: DisplayOption = { id: "submit", label: "Submit", value: "__submit__", index: -1, isSubmit: true };
	const allItems: DisplayOption[] = [...choiceItems, dontKnowItem, askFirstItem, submitItem];

	return ctx.ui.custom<QuizResponse | null>(
		(tui: any, theme: any, _kb: any, done: (result: QuizResponse | null) => void) => {
			let optionIndex = 0;
			let phase: "select" | "feedback" = "select";
			let focus: "options" | "note" = "options";
			let askFirstMode = false;
			const editor = makeNoteEditor(tui, theme);
			let cachedLines: string[] | undefined;
			let cachedWidth = -1;
			const selected = new Map<string, OptionAnswer>();

			function refresh() {
				cachedLines = undefined;
				tui.requestRender();
			}

			function noteText(): string | undefined {
				const t = editor.getText().trim();
				return t.length ? t : undefined;
			}

			function toOptions() {
				focus = "options";
				askFirstMode = false;
				editor.focused = false;
				refresh();
			}

			function toNote(forAskFirst = false) {
				focus = "note";
				askFirstMode = forAskFirst;
				editor.focused = true;
				refresh();
			}

			const choseDontKnow = () => selected.has(DONT_KNOW_ID);
			const realAnswers = () =>
				sortAnswers(Array.from(selected.values()).filter((a) => a.index !== DONT_KNOW_INDEX));

			function response(): QuizResponse {
				const note = noteText();
				return choseDontKnow()
					? { dontKnow: true, note, answers: [] }
					: { dontKnow: false, note, answers: realAnswers() };
			}

			// "I don't know" is exclusive: choosing it clears real selections, and
			// choosing any real option clears "I don't know".
			function toggleOption(item: DisplayOption) {
				if (item.id === DONT_KNOW_ID) {
					if (selected.has(DONT_KNOW_ID)) {
						selected.delete(DONT_KNOW_ID);
					} else {
						selected.clear();
						selected.set(DONT_KNOW_ID, { label: item.label, value: item.value, index: item.index });
					}
				} else {
					selected.delete(DONT_KNOW_ID);
					if (selected.has(item.id)) {
						selected.delete(item.id);
					} else {
						selected.set(item.id, { label: item.label, value: item.value, index: item.index });
					}
				}
				refresh();
			}

			function submit() {
				if (selected.size === 0) return;
				phase = "feedback";
				refresh();
			}

			function handleInput(data: string) {
				if (phase === "feedback") {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
						done(response());
					}
					return;
				}

				// Tab toggles focus between the options list and the note field.
				if (matchesKey(data, Key.tab)) {
					if (focus === "options") {
						toNote(Boolean(allItems[optionIndex]?.isAskFirst));
					} else {
						toOptions();
					}
					return;
				}

				if (focus === "note") {
					if (matchesKey(data, Key.up)) {
						optionIndex = allItems.length - 1;
						toOptions();
						return;
					}
					if (matchesKey(data, Key.escape)) {
						toOptions();
						return;
					}
					if (matchesKey(data, Key.enter)) {
						if (askFirstMode && noteText()) {
							done({ dontKnow: false, askFirst: true, note: noteText(), answers: [] });
							return;
						}
						toOptions();
						return;
					}
					editor.handleInput(data);
					tui.requestRender();
					return;
				}

				// focus === "options"
				if (matchesKey(data, Key.up)) {
					optionIndex = Math.max(0, optionIndex - 1);
					refresh();
					return;
				}
				if (matchesKey(data, Key.down)) {
					if (optionIndex < allItems.length - 1) {
						optionIndex++;
						refresh();
					} else {
						toNote(false);
					}
					return;
				}

				const current = allItems[optionIndex];
				if (matchesKey(data, Key.space)) {
					if (current.isSubmit) return;
					if (current.isAskFirst) {
						const existingNote = noteText();
						if (existingNote) {
							done({ dontKnow: false, askFirst: true, note: existingNote, answers: [] });
						} else {
							toNote(true);
						}
						return;
					}
					toggleOption(current);
					return;
				}

				if (matchesKey(data, Key.enter)) {
					if (current.isSubmit) {
						submit();
						return;
					}
					if (current.isAskFirst) {
						const existingNote = noteText();
						if (existingNote) {
							done({ dontKnow: false, askFirst: true, note: existingNote, answers: [] });
						} else {
							toNote(true);
						}
						return;
					}
					toggleOption(current);
					return;
				}

				if (matchesKey(data, Key.escape)) {
					done(null);
				}
			}

			function render(width: number): string[] {
				// The cache MUST be keyed on width: pi-tui calls requestRender() but NOT
				// invalidate() on terminal resize, so render() can be re-entered with a
				// new width. Returning stale wider lines trips the TUI width guard and
				// crashes the process.
				if (cachedLines && cachedWidth === width) return cachedLines;

				const lines: string[] = [];
				const add = (text: string) => lines.push(truncateToWidth(text, width));
				pushHeader(lines, theme, width, question, context);

				if (phase === "feedback") {
					renderFeedback(
						lines,
						theme,
						width,
						options,
						realAnswers().map((a) => a.index),
						correctIndices,
						explanation,
						choseDontKnow(),
						noteText(),
					);
					add(theme.fg("accent", "─".repeat(width)));
					cachedLines = lines;
					cachedWidth = width;
					return lines;
				}

				lines.push("");
				for (let i = 0; i < allItems.length; i++) {
					const item = allItems[i];
					const isFocused = focus === "options" && i === optionIndex;
					const prefix = isFocused ? theme.fg("accent", "> ") : "  ";

					if (item.isSubmit) {
						const label = selected.size > 0 ? `✓ ${item.label} (${selected.size} selected)` : `○ ${item.label}`;
						const styled = isFocused
							? theme.fg("accent", label)
							: theme.fg(selected.size > 0 ? "success" : "dim", label);
						add(`${prefix}${styled}`);
						continue;
					}

					if (item.isAskFirst) {
						const styled = isFocused ? theme.fg("accent", item.label) : theme.fg("dim", item.label);
						add(`${prefix}${styled}`);
						continue;
					}

					if (item.id === DONT_KNOW_ID) {
						lines.push(""); // visual separation from the real options
						const checked = selected.has(item.id);
						const label = `${checked ? "[x]" : "[ ]"} ${item.label}`;
						const styled = isFocused ? theme.fg("accent", label) : theme.fg(checked ? "warning" : "dim", label);
						add(`${prefix}${styled}`);
						continue;
					}

					const checked = selected.has(item.id);
					const marker = checked ? "[x]" : "[ ]";
					const label = `${marker} ${item.index}. ${renderTerminalMath(item.label)}`;
					const styled = isFocused ? theme.fg("accent", label) : theme.fg(checked ? "success" : "text", label);
					addOptionWrapped(lines, prefix, "  ", styled, width);
					if (item.description) {
						addWrapped(lines, theme.fg("muted", renderTerminalMath(item.description)), width, "     ");
					}
				}

				pushNoteField(lines, theme, width, editor, focus === "note", askFirstMode);

				lines.push("");
				if (selected.size === 0 && !askFirstMode) {
					add(theme.fg("warning", " Select at least one answer before submitting."));
				}
				if (focus === "note") {
					const enterHint = askFirstMode ? "Enter send question" : "Enter/↑ back to options";
					add(theme.fg("dim", ` Type text • Ctrl+J newline • ${enterHint} • Tab/Esc back`));
				} else {
					add(theme.fg("dim", " ↑↓ navigate (↓ into Note) • Space toggle • Enter submit • Tab note • Esc cancel"));
				}
				add(theme.fg("accent", "─".repeat(width)));
				// Not cached when the note is focused: the editor renders a live cursor.
				if (focus !== "note") {
					cachedLines = lines;
					cachedWidth = width;
				}
				return lines;
			}

			return {
				render,
				invalidate: () => {
					cachedLines = undefined;
					editor.invalidate();
				},
				handleInput,
			};
		},
	);
}

function sortAnswers(answers: OptionAnswer[]): OptionAnswer[] {
	return [...answers].sort((a, b) => a.index - b.index);
}

// Shared UI mutex. ctx.ui.custom()/editor can only handle one active call at
// a time, so ALL pop-up-style tools (quiz, ask_user_question, ...) must
// serialize against each other, not just against themselves. We stash one
// mutex on globalThis so separate extension files can share it without
// importing each other.
const SHARED_UI_LOCK_KEY = "__piSharedUiLock";
function getSharedUiLock() {
	const g = globalThis as any;
	if (!g[SHARED_UI_LOCK_KEY]) {
		let chain: Promise<void> = Promise.resolve();
		g[SHARED_UI_LOCK_KEY] = {
			withLock<T>(fn: () => T | Promise<T>): Promise<T> {
				const prev = chain;
				let release: () => void;
				chain = new Promise<void>((r) => { release = r; });
				return prev.then(fn).finally(() => release!());
			},
		};
	}
	return g[SHARED_UI_LOCK_KEY] as { withLock<T>(fn: () => T | Promise<T>): Promise<T> };
}
const sharedUiLock = getSharedUiLock();

function withUILock<T>(fn: () => Promise<T>): Promise<T> {
	return sharedUiLock.withLock(fn);
}

export default function quiz(pi: ExtensionAPI) {
	pi.registerTool({
		name: "quiz",
		label: "quiz",
		description:
			"Ask the user a GRADED question with a known correct answer, then instantly grade and give feedback. Unlike ask_user_question (which collects preferences/decisions with no right answer), quiz always has a correct answer supplied by you, marks the user's selection right/wrong (✓/✗), reveals the correct answer, and can show an explanation. Use it to (1) assess what the learner already understands before teaching, and (2) run tight practice/retrieval loops after explaining, or probe understanding whenever you're unsure they've got it. Options-only: single-select or multi-select, plus an automatic 'I don't know' choice so the user can signal a genuine gap instead of guessing. An always-present optional note field (Tab to focus it) lets the user attach a free-text note to ANY answer; it reaches you only when non-empty. No free-text answers — for non-graded questions use ask_user_question instead.",
		promptSnippet:
			"Use the quiz tool to test the user with a graded multiple-choice or multi-select question (required correct answer + required explanation). For non-graded questions, use ask_user_question.",
		promptGuidelines: [
			"quiz is GRADED; ask_user_question is not. If the question has a correct answer, use quiz. If you just need a preference, decision, or open-ended input, use ask_user_question.",
			'correctAnswer is REQUIRED and is the option value, not a position number. Single-select: one string (e.g. "mercury"). Multi-select: an array of strings (e.g. ["belize", "niue"]).',
			"Always pass the option's `value` string as correctAnswer — it is self-checking and prevents miscounting positions. A value that matches no option is a hard error.",
			"explanation is REQUIRED — always say why the correct answer is correct.",
			"Multi-select is graded as an exact-set match: the user is correct only if they select every correct option and no incorrect ones.",
			"There is no free-text mode. An 'I don't know' choice is ALWAYS added automatically — provide ONLY the real, gradable options (at least two). Never add your own uncertainty/opt-out option like 'I don't know', 'I'm not sure', or 'Not sure'; that is handled for you and a manual one would be redundant or gradable-as-wrong.",
			"If a result comes back as dontKnow, the user honestly did not know and did NOT guess — treat it as a genuine knowledge gap to teach into, not as a wrong answer.",
			"Any answer (right, wrong, or 'I don't know') may carry an optional free-text `note` the user typed in the always-present note field. When present it reflects what they were thinking or unsure about — read it and let it steer your follow-up. It is omitted entirely when empty.",
			"Treat each wrong answer (distractor) as a diagnostic probe, not just filler: make it a specific, believable mistake the user might actually hold — a common misconception, or an adjacent/easily-confused concept — so that WHICH wrong answer they pick reveals WHICH nuance of their understanding is off. You learn far more from a targeted wrong choice than from a binary right/wrong, and the choice tells you exactly which gap to teach into next (and what the explanation should address).",
			"Guardrail: every distractor must be unambiguously wrong on the intended reading — tempting, but a real error, not a defensible alternative. Don't drift into trick questions.",
			"Anti-guessing hygiene: don't let the correct answer stand out by form (longest, most precise, most hedged, or the only one in the right format). Keep options similar in length, specificity, and phrasing so it can't be picked from shape alone.",
			"Set multiSelect: true only when more than one option is correct.",
			"Options are shuffled before display by default, so don't worry about which position you list the correct answer in. Set shuffle: false only when option order is meaningful (ordered values, or an 'All/None of the above' option that must stay last).",
			"To probe nuance, ask several quick quiz questions and adapt each one based on the previous answers, rather than writing one giant question.",
			"Don't leak the answer through formatting: keep option phrasing/length even and don't hint which is correct.",
		],
		parameters: QuizParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const context = params.details?.trim() || undefined;
			const explanation = params.explanation.trim();
			const mode: QuizMode = params.multiSelect ? "multi-select" : "single-select";

			let options: QuizOption[];
			try {
				options = normalizeOptions(params.options);
			} catch (e) {
				return unavailableResult(params.question, mode, `quiz ${(e as Error).message}`, [], context);
			}

			// Shuffle for display (default on) BEFORE resolving correct indices, so
			// grading matches the order the user sees.
			if (params.shuffle !== false) {
				options = shuffleOptions(options);
			}

			// Emit the true (post-shuffle) display order immediately, before the UI
			// blocks on the user's answer. Listeners such as md-log rely on this to
			// show the question in the SAME order the user actually sees it, instead
			// of the pre-shuffle order the agent originally wrote in its tool call.
			// Deliberately omits correctIndices/explanation — this fires before the
			// user has answered and must not leak the answer.
			onUpdate?.({
				content: [{ type: "text", text: "Awaiting user response..." }],
				details: { options: options.map((o, i) => ({ index: i + 1, label: o.label })) },
			});

			const { indices: correctIndices, error: correctError } = resolveCorrect(
				params.correctAnswer as string | string[],
				options,
			);

			if (signal?.aborted) {
				return cancelledResult(params.question, mode, correctIndices, context);
			}

			if (options.length < 2) {
				return unavailableResult(
					params.question,
					mode,
					"quiz requires at least two options",
					correctIndices,
					context,
				);
			}

			if (correctError) {
				return unavailableResult(params.question, mode, `quiz ${correctError}`, correctIndices, context);
			}

			if (!ctx.hasUI) {
				return unavailableResult(params.question, mode, "quiz requires interactive mode UI", correctIndices, context);
			}

			return withUILock(async () => {
				const response =
					mode === "single-select"
						? await askSingleChoice(ctx, params.question, context, options, correctIndices, explanation)
						: await askMultiChoice(ctx, params.question, context, options, correctIndices, explanation);
				if (!response) {
					return cancelledResult(params.question, mode, correctIndices, context);
				}
				return buildResult(params.question, context, mode, options, response, correctIndices, explanation);
			});
		},

		renderCall(args, theme) {
			// NOTE: never render correctAnswer or explanation here — it would leak
			// the answer into the transcript before the user responds. We also do NOT
			// enumerate the options here: they are shuffled at execute time, so any
			// order shown during streaming would be stale/misleading. The full option
			// list is rendered — in its true display order — by renderResult after the
			// user answers.
			const options = normalizeOptions(
				args.options as Array<{ label: string; value?: string; description?: string }> | undefined,
			);
			let text = theme.fg("toolTitle", theme.bold("quiz ")) + theme.fg("muted", renderTerminalMath(args.question));
			if (args.multiSelect) {
				text += theme.fg("dim", " [multi-select]");
			}
			if (options.length > 0) {
				const noun = options.length === 1 ? "option" : "options";
				text += theme.fg("dim", ` (${options.length} ${noun})`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as QuizResultDetails | undefined;
			if (!details) {
				const first = result.content[0];
				return new Text(first?.type === "text" ? first.text : "", 0, 0);
			}

			if (details.status === "cancelled") {
				return new Text(theme.fg("warning", details.message || "Cancelled"), 0, 0);
			}
			if (details.status === "unavailable") {
				return new Text(theme.fg("warning", details.message || "quiz unavailable"), 0, 0);
			}
			if (details.askFirst) {
				const q = details.note ? renderTerminalMath(details.note) : "(paused quiz to ask a question)";
				return new Text(theme.fg("accent", `💬 Question before answering quiz: ${q}`), 0, 0);
			}

			const correctSet = new Set(details.correctIndices);
			const selectedSet = new Set(details.answers.map((a) => a.index));
			const lines: string[] = [];

			// Full option list in the true (shuffled) display order, with ✓/✗ marks.
			// Falls back to just the selected answers for older results that predate
			// details.options.
			const displayed =
				details.options && details.options.length > 0
					? details.options
					: details.answers.map((a) => ({ index: a.index, label: a.label }));

			for (const opt of displayed) {
				const isSelected = selectedSet.has(opt.index);
				const isKey = correctSet.has(opt.index);
				const cleanLabel = renderTerminalMath(opt.label);
				let mark: string;
				let body: string;
				if (details.dontKnow) {
					// No guess — only reveal the correct answer(s); never show ✗.
					mark = isKey ? theme.fg("success", "✓ ") : "  ";
					body = isKey ? theme.fg("success", `${opt.index}. ${cleanLabel}`) : theme.fg("dim", `${opt.index}. ${cleanLabel}`);
				} else if (isSelected && isKey) {
					mark = theme.fg("success", "✓ ");
					body = theme.fg("accent", `${opt.index}. ${cleanLabel}`);
				} else if (isSelected && !isKey) {
					mark = theme.fg("error", "✗ ");
					body = theme.fg("error", `${opt.index}. ${cleanLabel}`);
				} else if (!isSelected && isKey) {
					mark = theme.fg("success", "✓ ");
					body = theme.fg("success", `${opt.index}. ${cleanLabel}`);
				} else {
					mark = "  ";
					body = theme.fg("dim", `${opt.index}. ${cleanLabel}`);
				}
				lines.push(`${mark}${body}`);
			}

			lines.push("");
			const verdict = details.dontKnow
				? theme.fg("warning", "I don't know")
				: details.correct
					? theme.fg("success", "Correct!")
					: theme.fg("error", "Incorrect");
			lines.push(verdict);

			if (details.note) {
				lines.push(theme.fg("muted", `Note: ${renderTerminalMath(details.note)}`));
			}

			if (details.explanation) {
				lines.push(theme.fg("muted", renderTerminalMath(details.explanation)));
			}

			return new Text(lines.join("\n"), 0, 0);
		},
	});
}
