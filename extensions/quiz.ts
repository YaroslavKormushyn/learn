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
// quiz & explain — GRADED siblings of ask_user_question.
//
// 1. `quiz`: Multiple-choice / multi-select graded question.
//    - `explanation` precedes `correctAnswer` in the schema (CoT ordering:
//      reason out why the answer is right before committing to the key).
//    - Options have no `description` field so models cannot leak hints inside
//      option sub-labels.
//    - Includes a lightweight confidence selector (←/→ across 30/50/70/90/100%)
//      for 2×2 diagnostic readouts (Correct+High, Correct+Low, Wrong+High
//      Misconception, Wrong+Low Gap).
//
// 2. `explain`: Pre-committed free-recall / Feynman / practice problem tool.
//    - The agent commits to `committedAnswer` (full explanation or worked
//      modelSolution) BEFORE the learner sees the question.
//    - The learner types their response in a multi-line editor and can either:
//      a) Submit & reveal the committed reference answer (graded against the
//         immutable commitment, eliminating sycophancy),
//      b) Request a minimal hint / check work so far WITHOUT spoiling the
//         committed answer (`requestedHint: true`),
//      c) Ask a clarifying question first WITHOUT spoiling (`askFirst: true`),
//      d) Select "I don't know" to reveal the reference answer.
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

// Confidence stops (raw % probability that the selected answer is correct).
// Index -1 = unset (user didn't touch ←/→).
// Pressing → from unset starts at 70% (2) → 90% (3) → 100% (4).
// Pressing ← from unset starts at 50% (1) → 30% (0).
const CONFIDENCE_STOPS = [30, 50, 70, 90, 100] as const;
const CONFIDENCE_LABELS: Record<number, string> = {
	30: "30% (Guessing)",
	50: "50% (Unsure)",
	70: "70% (Fairly sure)",
	90: "90% (Confident)",
	100: "100% (Certain)",
};

function stepConfidence(currentIndex: number, dir: "left" | "right"): number {
	if (dir === "right") {
		if (currentIndex === -1) return 2; // 70%
		return Math.min(CONFIDENCE_STOPS.length - 1, currentIndex + 1);
	} else {
		if (currentIndex === -1) return 1; // 50%
		if (currentIndex === 0) return -1; // back to unset
		return currentIndex - 1;
	}
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

interface QuizResponse {
	dontKnow: boolean;
	askFirst?: boolean;
	note?: string;
	confidence?: number;
	answers: OptionAnswer[];
}

type QuizStatus = "answered" | "cancelled" | "unavailable";
type QuizMode = "single-select" | "multi-select";
type QuizRole = "probe" | "predict" | "check";

interface DisplayedOption {
	index: number; // 1-based, in the final (possibly shuffled) display order
	label: string;
}

interface QuizResultDetails {
	status: QuizStatus;
	questionType?: QuizRole;
	question: string;
	context?: string;
	mode: QuizMode;
	answers: OptionAnswer[];
	correctIndices: number[];
	options?: DisplayedOption[]; // full option list in display order, for the transcript
	correct?: boolean;
	confidence?: number; // 30 | 50 | 70 | 90 | 100 when set by learner
	dontKnow?: boolean; // user selected "I don't know" instead of guessing
	askFirst?: boolean; // user paused the quiz to ask a question first without spoiling the answer
	note?: string; // optional free-text from the always-present note field (any answer)
	explanation?: string;
	message?: string;
}

// Intentionally NO `description` field on quiz options: models reliably use
// option descriptions to leak reasoning ("only true in DC", "misses the root"),
// making quizzes solvable by elimination. All reasoning belongs in `explanation`.
const OptionSchema = Type.Object({
	label: Type.String({
		description: "Display label for the answer option — a bare claim with zero justification.",
	}),
	value: Type.Optional(
		Type.String({
			description: "Optional machine-readable value returned for the option. Defaults to the label.",
		}),
	),
});

// `explanation` is placed BEFORE `correctAnswer` by design: models generate
// tool arguments in schema order, so writing the explanation first forces the
// model to reason out the derivation before committing to `correctAnswer`.
const QuizParams = Type.Object({
	type: Type.Optional(
		Type.Union([Type.Literal("probe"), Type.Literal("predict"), Type.Literal("check")], {
			description:
				"Optional role in the teaching cycle: 'probe' (Phase 1 diagnostic), 'predict' (posed BEFORE teaching a step to motivate discovery), or 'check' (posed AFTER teaching a step to verify understanding).",
		}),
	),
	question: Type.String({
		description: "The single quiz question to ask. Ask exactly one question per tool call.",
	}),
	details: Type.Optional(
		Type.String({ description: "Optional extra context or instructions shown under the question." }),
	),
	options: Type.Array(OptionSchema, {
		description:
			"The answer options (2 or more). Options only — there is no free-text mode. Every option must be a bare claim (no 'because...' justification). Give each option a stable `value`; you reference the correct one by that value in correctAnswer.",
		minItems: 2,
	}),
	multiSelect: Type.Optional(
		Type.Boolean({ description: "Set to true when more than one option is correct and the user must select all of them." }),
	),
	explanation: Type.String({
		description:
			"REQUIRED. Explanation revealed AFTER the user answers (shown whether they got it right or wrong). Written BEFORE correctAnswer: reason out why the correct option holds first, then commit to correctAnswer.",
	}),
	correctAnswer: Type.Union([Type.String(), Type.Array(Type.String())], {
		description:
			'REQUIRED. The correct answer as the option value(s) — the `value` field of the option you intend. Single-select: a single string (e.g. "mercury"). Multi-select: an array of strings (e.g. ["belize", "niue"]); the user is only correct if their selection matches this set exactly. Always pass the value, not a position number — this is self-checking and prevents miscounting.',
	}),
	shuffle: Type.Optional(
		Type.Boolean({
			description:
				"Defaults to true: options are randomly reordered before display so the correct answer isn't always in the same position. Set to false only when option order is meaningful (e.g. ordered numeric values, or an 'All/None of the above' option that must stay last).",
		}),
	),
});

// ────────────────────────────────────────────────────────────────────────────
// explain tool types & schema
// ────────────────────────────────────────────────────────────────────────────

type ExplainRole = "predict" | "check" | "feynman" | "practice";

interface ExplainResponse {
	text?: string;
	dontKnow?: boolean;
	requestedHint?: boolean;
	askFirst?: boolean;
}

export interface ExplainResultDetails {
	status: QuizStatus;
	questionType?: ExplainRole;
	question: string;
	context?: string;
	text?: string;
	committedAnswer?: string; // omitted from details when requestedHint or askFirst is true so it never leaks!
	dontKnow?: boolean;
	requestedHint?: boolean;
	askFirst?: boolean;
	message?: string;
}

const ExplainParams = Type.Object({
	type: Type.Optional(
		Type.Union(
			[
				Type.Literal("predict"),
				Type.Literal("check"),
				Type.Literal("feynman"),
				Type.Literal("practice"),
			],
			{
				description:
					"Role of the free-recall prompt: 'predict' (before teaching), 'check' (after teaching), 'feynman' (teach-back), or 'practice' (deliberate problem-solving).",
			},
		),
	),
	question: Type.String({
		description:
			"The single free-recall question, Feynman prompt, or practice problem to pose (supports Markdown and $...$ LaTeX). Never announce the target proposition in a practice problem.",
	}),
	details: Type.Optional(
		Type.String({
			description: "Optional extra context, scenario, or mode tag shown under the question.",
		}),
	),
	committedAnswer: Type.String({
		description:
			"REQUIRED. Your complete, pre-committed reference answer or worked modelSolution (with steps in order), written BEFORE the learner sees the question. Hidden from the learner until they submit a final answer. When their answer returns, grade strictly against this immutable commitment — never move the goalposts to be kind.",
	}),
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

function shuffleOptions(options: QuizOption[]): QuizOption[] {
	const out = [...options];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

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
	"0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
	"5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
	"+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
	"a": "ₐ", "e": "ₑ", "h": "ₕ", "i": "ᵢ", "j": "ⱼ",
	"k": "ₖ", "l": "ₗ", "m": "ₘ", "n": "ₙ", "o": "ₒ",
	"p": "ₚ", "r": "ᵣ", "s": "ₛ", "t": "ₜ", "u": "ᵤ",
	"v": "ᵥ", "x": "ₓ",
};

const LATEX_SYMBOLS: Record<string, string> = {
	alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε",
	zeta: "ζ", eta: "η", theta: "θ", vartheta: "θ", iota: "ι", kappa: "κ",
	lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", varrho: "ρ",
	sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ",
	chi: "χ", psi: "ψ", omega: "omega",
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
LATEX_SYMBOLS["omega"] = "ω";

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
	confidence?: number,
	questionType?: QuizRole,
): QuizResultDetails {
	return {
		status,
		questionType,
		question,
		context,
		mode,
		answers,
		correctIndices,
		options,
		correct,
		confidence,
		dontKnow,
		askFirst,
		note,
		explanation,
		message,
	};
}

function cancelledResult(
	question: string,
	mode: QuizMode,
	correctIndices: number[],
	context?: string,
	questionType?: QuizRole,
) {
	const message = "User cancelled the quiz";
	return {
		content: [{ type: "text" as const, text: message }],
		details: buildStructuredResult(
			"cancelled",
			question,
			mode,
			[],
			correctIndices,
			undefined,
			undefined,
			context,
			message,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			questionType,
		),
	};
}

function unavailableResult(
	question: string,
	mode: QuizMode,
	message: string,
	correctIndices: number[],
	context?: string,
	questionType?: QuizRole,
) {
	return {
		content: [{ type: "text" as const, text: message }],
		details: buildStructuredResult(
			"unavailable",
			question,
			mode,
			[],
			correctIndices,
			undefined,
			undefined,
			context,
			message,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			questionType,
		),
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
	questionType?: QuizRole,
) {
	const { dontKnow, askFirst, note, confidence, answers } = response;
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
				undefined,
				questionType,
			),
		};
	}

	const selectedIndices = answers.map((a) => a.index);
	const correct = dontKnow ? false : isCorrect(selectedIndices, correctIndices);
	const correctStr = correctIndices.map((i) => formatOptionRef(options, i)).join(", ");
	const effectiveConfidence = dontKnow ? undefined : confidence;

	let text: string;
	if (dontKnow) {
		text = `User selected "I don't know" — they did not attempt an answer (a genuine knowledge gap, not a wrong guess).`;
		text += `\nCorrect: ${correctStr}`;
		if (note) text += `\nUser's thinking / note: ${note}`;
	} else {
		const verdict = correct ? "correctly" : "incorrectly";
		const selectedStr = answers.map((a) => `${a.index}. ${a.label}`).join(", ");
		text = `User answered ${verdict}.\nSelected: ${selectedStr}\nCorrect: ${correctStr}`;
		if (effectiveConfidence !== undefined) {
			text += `\nConfidence: ${CONFIDENCE_LABELS[effectiveConfidence] || `${effectiveConfidence}%`}`;
		}
		if (note) text += `\nUser's thinking / note: ${note}`;
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
			effectiveConfidence,
			questionType,
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
	confidence?: number,
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
			marker = isKey ? "✓" : " ";
			color = isKey ? "success" : "dim";
		} else if (isSelected && isKey) {
			marker = "✓";
			color = "success";
		} else if (isSelected && !isKey) {
			marker = "✗";
			color = "error";
		} else if (!isSelected && isKey) {
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
	const confSuffix = !dontKnow && confidence !== undefined ? ` (Confidence: ${confidence}%)` : "";
	if (dontKnow) {
		add(theme.fg("warning", " · You said: I don't know"));
		const correctStr = correctIndices.map((i) => formatTerminalOptionRef(options, i)).join(", ");
		addWrapped(lines, theme.fg("muted", `Correct answer: ${correctStr}`), width, " ");
	} else if (correct) {
		add(theme.fg("success", ` ✓ Correct!${confSuffix}`));
	} else {
		add(theme.fg("error", ` ✗ Incorrect.${confSuffix}`));
		const correctStr = correctIndices.map((i) => formatTerminalOptionRef(options, i)).join(", ");
		addWrapped(lines, theme.fg("muted", `Correct answer: ${correctStr}`), width, " ");
	}
	if (note) {
		addWrapped(lines, theme.fg("muted", `Your thinking / note: ${renderTerminalMath(note)}`), width, " ");
	}
	if (explanation) {
		lines.push("");
		addWrapped(lines, theme.fg("text", renderTerminalMath(explanation)), width, " ");
	}
	lines.push("");
	add(theme.fg("dim", " Enter/Esc to continue"));
}

// Top border + question + optional context.
function pushHeader(
	lines: string[],
	theme: any,
	width: number,
	question: string,
	context: string | undefined,
	badge?: string,
): void {
	lines.push(truncateToWidth(theme.fg("accent", "─".repeat(width)), width));
	if (badge) {
		lines.push(truncateToWidth(` ${theme.fg("accent", badge)}`, width));
	}
	addWrapped(lines, theme.fg("text", renderTerminalMath(question)), width, " ");
	if (context) {
		lines.push("");
		addWrapped(lines, theme.fg("muted", renderTerminalMath(context)), width, " ");
	}
}

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

function pushConfidenceRow(lines: string[], theme: any, width: number, confidenceIndex: number): void {
	lines.push("");
	const chips = CONFIDENCE_STOPS.map((stop, idx) => {
		if (idx === confidenceIndex) {
			return theme.fg("accent", `[${stop}%]`);
		}
		return theme.fg("dim", `${stop}%`);
	}).join("  ");
	const status =
		confidenceIndex >= 0
			? theme.fg("accent", CONFIDENCE_LABELS[CONFIDENCE_STOPS[confidenceIndex]])
			: theme.fg("dim", "optional — press ←/→ to set");
	lines.push(truncateToWidth(` ${theme.fg("muted", "Confidence:")} ${chips}  ${status}`, width));
}

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
		: "Thinking out loud / side question (optional — ↓ or Tab to focus):";
	const label = focused ? theme.fg("accent", titleText) : theme.fg("muted", titleText);
	addWrapped(lines, label, width, " ");
	for (const line of editor.render(width)) lines.push(line);
}

function makeNoteEditor(tui: any, theme: any): Editor {
	const editor = new Editor(tui, createEditorTheme(theme));
	editor.focused = false;
	editor.disableSubmit = true;
	return editor;
}

function roleBadge(role?: QuizRole | ExplainRole): string | undefined {
	if (!role) return undefined;
	switch (role) {
		case "probe":
			return "🔎 PROBE (Finding Your Edge)";
		case "predict":
			return "🔮 PREDICT (Before We Derive It)";
		case "check":
			return "✓ CHECK YOUR UNDERSTANDING";
		case "feynman":
			return "🧠 FEYNMAN TEACH-BACK (In Your Own Words)";
		case "practice":
			return "🏋️ PRACTICE PROBLEM";
	}
}

async function askSingleChoice(
	ctx: any,
	question: string,
	context: string | undefined,
	options: QuizOption[],
	correctIndices: number[],
	explanation: string | undefined,
	questionType?: QuizRole,
): Promise<QuizResponse | null> {
	const allOptions: DisplayOption[] = options.map((option, index) => ({
		...option,
		id: `option:${index}`,
		index: index + 1,
	}));
	const dontKnowNav = allOptions.length;
	const askFirstNav = allOptions.length + 1;

	return ctx.ui.custom<QuizResponse | null>(
		(tui: any, theme: any, _kb: any, done: (result: QuizResponse | null) => void) => {
			let optionIndex = 0;
			let confidenceIndex = -1;
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

			function selectedConfidence(): number | undefined {
				return confidenceIndex >= 0 ? CONFIDENCE_STOPS[confidenceIndex] : undefined;
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
				const confidence = selectedConfidence();
				return dontKnow
					? { dontKnow: true, note, answers: [] }
					: { dontKnow: false, note, confidence, answers: chosen ? [chosen] : [] };
			}

			function handleInput(data: string) {
				if (phase === "feedback") {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
						done(response());
					}
					return;
				}

				if (matchesKey(data, Key.tab)) {
					if (focus === "options") {
						toNote(optionIndex === askFirstNav);
					} else {
						toOptions();
					}
					return;
				}

				if (focus === "note") {
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
				if (matchesKey(data, Key.left)) {
					confidenceIndex = stepConfidence(confidenceIndex, "left");
					refresh();
					return;
				}
				if (matchesKey(data, Key.right)) {
					confidenceIndex = stepConfidence(confidenceIndex, "right");
					refresh();
					return;
				}
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
				if (cachedLines && cachedWidth === width) return cachedLines;

				const lines: string[] = [];
				const add = (text: string) => lines.push(truncateToWidth(text, width));
				pushHeader(lines, theme, width, question, context, roleBadge(questionType));

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
						selectedConfidence(),
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
				pushConfidenceRow(lines, theme, width, confidenceIndex);
				pushNoteField(lines, theme, width, editor, focus === "note", askFirstMode);

				lines.push("");
				if (focus === "note") {
					const enterHint = askFirstMode ? "Enter send question" : "Enter/↑ back to options";
					add(theme.fg("dim", ` Type text • Ctrl+J newline • ${enterHint} • Tab/Esc back`));
				} else {
					add(
						theme.fg(
							"dim",
							" ↑↓ navigate • ←→ confidence • Enter select • Tab/↓ thinking note • Esc cancel",
						),
					);
				}
				add(theme.fg("accent", "─".repeat(width)));
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
	questionType?: QuizRole,
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
			let confidenceIndex = -1;
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

			function selectedConfidence(): number | undefined {
				return confidenceIndex >= 0 ? CONFIDENCE_STOPS[confidenceIndex] : undefined;
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
				const confidence = selectedConfidence();
				return choseDontKnow()
					? { dontKnow: true, note, answers: [] }
					: { dontKnow: false, note, confidence, answers: realAnswers() };
			}

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
				if (matchesKey(data, Key.left)) {
					confidenceIndex = stepConfidence(confidenceIndex, "left");
					refresh();
					return;
				}
				if (matchesKey(data, Key.right)) {
					confidenceIndex = stepConfidence(confidenceIndex, "right");
					refresh();
					return;
				}
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
				if (cachedLines && cachedWidth === width) return cachedLines;

				const lines: string[] = [];
				const add = (text: string) => lines.push(truncateToWidth(text, width));
				pushHeader(lines, theme, width, question, context, roleBadge(questionType));

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
						selectedConfidence(),
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
						lines.push("");
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

				pushConfidenceRow(lines, theme, width, confidenceIndex);
				pushNoteField(lines, theme, width, editor, focus === "note", askFirstMode);

				lines.push("");
				if (selected.size === 0 && !askFirstMode) {
					add(theme.fg("warning", " Select at least one answer before submitting."));
				}
				if (focus === "note") {
					const enterHint = askFirstMode ? "Enter send question" : "Enter/↑ back to options";
					add(theme.fg("dim", ` Type text • Ctrl+J newline • ${enterHint} • Tab/Esc back`));
				} else {
					add(
						theme.fg(
							"dim",
							" ↑↓ navigate • ←→ confidence • Space toggle • Enter submit • Tab note • Esc cancel",
						),
					);
				}
				add(theme.fg("accent", "─".repeat(width)));
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

// ────────────────────────────────────────────────────────────────────────────
// explain TUI component (Pre-committed Free-Recall / Feynman / Practice Problem)
// ────────────────────────────────────────────────────────────────────────────

async function askFreeRecall(
	ctx: any,
	question: string,
	context: string | undefined,
	committedAnswer: string,
	questionType?: ExplainRole,
): Promise<ExplainResponse | null> {
	const ACTIONS = [
		{ id: "submit", label: "✓ Submit answer & reveal reference solution" },
		{ id: "hint", label: "💡 I'm stuck / Check my work so far (give a minimal hint without spoiling)" },
		{ id: "ask", label: "💬 Ask a clarifying question first (pause without spoiling)" },
		{ id: "dont-know", label: "○ I don't know (reveal reference solution)" },
	] as const;

	return ctx.ui.custom<ExplainResponse | null>(
		(tui: any, theme: any, _kb: any, done: (result: ExplainResponse | null) => void) => {
			let phase: "input" | "feedback" = "input";
			let focus: "editor" | "actions" = "editor";
			let actionIndex = 0;
			let finalOutcome: ExplainResponse | null = null;
			let warningMsg: string | null = null;

			const editor = new Editor(tui, createEditorTheme(theme));
			editor.focused = true;
			editor.disableSubmit = true;

			let cachedLines: string[] | undefined;
			let cachedWidth = -1;

			function refresh() {
				cachedLines = undefined;
				tui.requestRender();
			}

			function userText(): string | undefined {
				const t = editor.getText().trim();
				return t.length > 0 ? t : undefined;
			}

			function focusEditor() {
				focus = "editor";
				editor.focused = true;
				refresh();
			}

			function focusActions(idx = 0) {
				focus = "actions";
				actionIndex = idx;
				editor.focused = false;
				refresh();
			}

			function executeAction(id: (typeof ACTIONS)[number]["id"]) {
				const text = userText();
				if (id === "submit") {
					if (!text) {
						warningMsg = "Type your explanation/solution above first (or select 'I don't know').";
						focusEditor();
						return;
					}
					warningMsg = null;
					finalOutcome = { text, dontKnow: false };
					phase = "feedback";
					refresh();
					return;
				}
				if (id === "dont-know") {
					warningMsg = null;
					finalOutcome = { text, dontKnow: true };
					phase = "feedback";
					refresh();
					return;
				}
				if (id === "hint") {
					// Return immediately WITHOUT entering feedback so committedAnswer stays unrevealed!
					done({ text, requestedHint: true });
					return;
				}
				if (id === "ask") {
					if (!text) {
						warningMsg = "Type your clarifying question in the box above first, then select this option.";
						focusEditor();
						return;
					}
					done({ text, askFirst: true });
					return;
				}
			}

			function handleInput(data: string) {
				if (phase === "feedback") {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
						done(finalOutcome);
					}
					return;
				}

				if (matchesKey(data, Key.tab)) {
					if (focus === "editor") {
						focusActions(0);
					} else {
						focusEditor();
					}
					return;
				}

				if (focus === "editor") {
					if (matchesKey(data, Key.escape)) {
						done(null);
						return;
					}
					// Pressing Enter in the editor moves focus to the "Submit answer" button
					// (Ctrl+J inserts a newline). This prevents accidental mid-thought submission
					// while making double-Enter submit cleanly.
					if (matchesKey(data, Key.enter)) {
						focusActions(0);
						return;
					}
					if (warningMsg) warningMsg = null;
					editor.handleInput(data);
					tui.requestRender();
					return;
				}

				// focus === "actions"
				if (matchesKey(data, Key.up)) {
					if (actionIndex > 0) {
						actionIndex--;
						refresh();
					} else {
						focusEditor();
					}
					return;
				}
				if (matchesKey(data, Key.down)) {
					if (actionIndex < ACTIONS.length - 1) {
						actionIndex++;
						refresh();
					}
					return;
				}
				if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
					executeAction(ACTIONS[actionIndex].id);
					return;
				}
				if (matchesKey(data, Key.escape)) {
					focusEditor();
				}
			}

			function render(width: number): string[] {
				if (cachedLines && cachedWidth === width && focus !== "editor") return cachedLines;

				const lines: string[] = [];
				const add = (text: string) => lines.push(truncateToWidth(text, width));
				pushHeader(lines, theme, width, question, context, roleBadge(questionType));

				if (phase === "feedback" && finalOutcome) {
					lines.push("");
					if (finalOutcome.dontKnow) {
						add(theme.fg("warning", " · You selected: I don't know"));
						if (finalOutcome.text) {
							addWrapped(lines, theme.fg("muted", `Your notes: ${renderTerminalMath(finalOutcome.text)}`), width, " ");
						}
					} else {
						add(theme.fg("accent", " Your response:"));
						addWrapped(lines, theme.fg("text", renderTerminalMath(finalOutcome.text || "")), width, "   ");
					}
					lines.push("");
					add(theme.fg("success", " Committed reference answer:"));
					addWrapped(lines, theme.fg("text", renderTerminalMath(committedAnswer)), width, "   ");
					lines.push("");
					add(theme.fg("dim", " Enter/Esc to continue (AI will now grade your response against the reference)"));
					add(theme.fg("accent", "─".repeat(width)));
					cachedLines = lines;
					cachedWidth = width;
					return lines;
				}

				lines.push("");
				const editorTitle =
					focus === "editor"
						? theme.fg("accent", "Your explanation / working trace (Ctrl+J newline • Enter/Tab to actions):")
						: theme.fg("muted", "Your explanation / working trace (↑ or Tab to edit):");
				addWrapped(lines, editorTitle, width, " ");
				for (const line of editor.render(width)) lines.push(line);

				if (warningMsg) {
					lines.push("");
					add(theme.fg("warning", ` ⚠ ${warningMsg}`));
				}

				lines.push("");
				for (let i = 0; i < ACTIONS.length; i++) {
					const act = ACTIONS[i];
					const isSelected = focus === "actions" && i === actionIndex;
					const prefix = isSelected ? theme.fg("accent", "> ") : "  ";
					const color = isSelected ? "accent" : i === 0 ? "success" : "dim";
					add(`${prefix}${theme.fg(color, act.label)}`);
				}

				lines.push("");
				if (focus === "editor") {
					add(theme.fg("dim", " Type response • Ctrl+J newline • Enter/Tab choose action • Esc cancel"));
				} else {
					add(theme.fg("dim", " ↑↓ select action (↑ back to editor) • Enter confirm • Tab edit • Esc back"));
				}
				add(theme.fg("accent", "─".repeat(width)));

				if (focus !== "editor") {
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

const SHARED_UI_LOCK_KEY = "__piSharedUiLock";
function getSharedUiLock() {
	const g = globalThis as any;
	if (!g[SHARED_UI_LOCK_KEY]) {
		let chain: Promise<void> = Promise.resolve();
		g[SHARED_UI_LOCK_KEY] = {
			withLock<T>(fn: () => T | Promise<T>): Promise<T> {
				const prev = chain;
				let release: () => void;
				chain = new Promise<void>((r) => {
					release = r;
				});
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
	// ── 1. quiz (Multiple-Choice / Multi-Select Graded Question) ──────────────
	pi.registerTool({
		name: "quiz",
		label: "quiz",
		description:
			"Ask the user a GRADED multiple-choice or multi-select question with a known correct answer, then instantly grade and give feedback. Unlike ask_user_question (which collects preferences/decisions with no right answer), quiz always has a correct answer supplied by you, marks the user's selection right/wrong (✓/✗), reveals the correct answer, and shows an explanation. Learners can also set their confidence (30%–100%) via ←/→ and write their reasoning in the thinking field. Options-only: for free-text graded recall or problem solving, use `explain`; for non-graded questions use `ask_user_question`.",
		promptSnippet:
			"Use `quiz` for graded multiple-choice/multi-select questions (write `explanation` before `correctAnswer`), `explain` for pre-committed free-recall/Feynman/practice problems, and `ask_user_question` for ungraded preferences/decisions.",
		promptGuidelines: [
			"quiz is GRADED multiple-choice; `explain` is GRADED free-recall (with a pre-committed reference answer); `ask_user_question` is UNGRADED.",
			"explanation is REQUIRED and comes BEFORE correctAnswer in the schema: reason out why the correct answer holds first, then commit to `correctAnswer`.",
			'correctAnswer is REQUIRED and is the option value, not a position number. Single-select: one string (e.g. "mercury"). Multi-select: an array of strings (e.g. ["belize", "niue"]).',
			"Every option must be a bare claim with ZERO justification ('because...'). Put all reasoning in `explanation`.",
			"There is no free-text mode on `quiz`. An 'I don't know' choice is ALWAYS added automatically — provide ONLY the real, gradable options (at least two).",
			"When `confidence` is returned on a quiz answer, read it against `correct`: Correct+High (90-100%) = solid; Correct+Low (30-50%) = fragile/guess, reinforce; Wrong+High (90-100%) = committed misconception, dislodge immediately; Wrong+Low = honest gap.",
			"Any answer may carry the learner's `thinking / note` — read it in full to diagnose their mental model, even when their selected option was right.",
			"Treat each wrong answer (distractor) as a diagnostic probe: mutate the correct claim into what someone holding a specific misconception would claim, in the same skeleton, length, and register.",
		],
		parameters: QuizParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const context = params.details?.trim() || undefined;
			const explanation = params.explanation.trim();
			const mode: QuizMode = params.multiSelect ? "multi-select" : "single-select";
			const questionType = params.type as QuizRole | undefined;

			let options: QuizOption[];
			try {
				options = normalizeOptions(params.options);
			} catch (e) {
				return unavailableResult(params.question, mode, `quiz ${(e as Error).message}`, [], context, questionType);
			}

			if (params.shuffle !== false) {
				options = shuffleOptions(options);
			}

			onUpdate?.({
				content: [{ type: "text", text: "Awaiting user response..." }],
				details: {
					questionType,
					options: options.map((o, i) => ({ index: i + 1, label: o.label })),
				},
			});

			const { indices: correctIndices, error: correctError } = resolveCorrect(
				params.correctAnswer as string | string[],
				options,
			);

			if (signal?.aborted) {
				return cancelledResult(params.question, mode, correctIndices, context, questionType);
			}

			if (options.length < 2) {
				return unavailableResult(
					params.question,
					mode,
					"quiz requires at least two options",
					correctIndices,
					context,
					questionType,
				);
			}

			if (correctError) {
				return unavailableResult(params.question, mode, `quiz ${correctError}`, correctIndices, context, questionType);
			}

			if (!ctx.hasUI) {
				return unavailableResult(
					params.question,
					mode,
					"quiz requires interactive mode UI",
					correctIndices,
					context,
					questionType,
				);
			}

			return withUILock(async () => {
				const response =
					mode === "single-select"
						? await askSingleChoice(ctx, params.question, context, options, correctIndices, explanation, questionType)
						: await askMultiChoice(ctx, params.question, context, options, correctIndices, explanation, questionType);
				if (!response) {
					return cancelledResult(params.question, mode, correctIndices, context, questionType);
				}
				return buildResult(
					params.question,
					context,
					mode,
					options,
					response,
					correctIndices,
					explanation,
					questionType,
				);
			});
		},

		renderCall(args, theme) {
			const options = normalizeOptions(
				args.options as Array<{ label: string; value?: string; description?: string }> | undefined,
			);
			const rolePrefix = args.type ? `[${String(args.type)}] ` : "";
			let text =
				theme.fg("toolTitle", theme.bold("quiz ")) +
				theme.fg("accent", rolePrefix) +
				theme.fg("muted", renderTerminalMath(args.question));
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
					mark = isKey ? theme.fg("success", "✓ ") : "  ";
					body = isKey
						? theme.fg("success", `${opt.index}. ${cleanLabel}`)
						: theme.fg("dim", `${opt.index}. ${cleanLabel}`);
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
			const confText =
				!details.dontKnow && details.confidence !== undefined ? ` (Confidence: ${details.confidence}%)` : "";
			const verdict = details.dontKnow
				? theme.fg("warning", "I don't know")
				: details.correct
					? theme.fg("success", `Correct!${confText}`)
					: theme.fg("error", `Incorrect${confText}`);
			lines.push(verdict);

			if (details.note) {
				lines.push(theme.fg("muted", `Thinking / Note: ${renderTerminalMath(details.note)}`));
			}

			if (details.explanation) {
				lines.push(theme.fg("muted", renderTerminalMath(details.explanation)));
			}

			return new Text(lines.join("\n"), 0, 0);
		},
	});

	// ── 2. explain (Pre-Committed Free-Recall / Feynman / Practice Problem) ───
	pi.registerTool({
		name: "explain",
		label: "explain",
		description:
			"Pose a GRADED free-recall question, Feynman teach-back prompt, or deliberate practice problem where the learner answers in their own words. You MUST supply `committedAnswer` (your complete reference explanation or worked modelSolution) BEFORE the learner sees the question. The commitment stays hidden while the learner works: if they submit a final answer (or pick 'I don't know'), the committed answer is revealed and you grade their response strictly against it (🔴/🟡/🟢 or practice verdict). If they click 'I'm stuck / Check my work' (`requestedHint: true`) or 'Ask a clarifying question' (`askFirst: true`), the committed answer is NOT revealed — give a minimal surgical nudge (Rung R0–R5) or answer their question and re-pose `explain`.",
		promptSnippet:
			"Use `explain` whenever the learner should generate an explanation, prediction, Feynman teach-back, or practice problem solution in their own words, graded against your pre-committed `committedAnswer`.",
		promptGuidelines: [
			"Always commit to the full correct answer or worked solution in `committedAnswer` BEFORE posing `explain`. Solve and shortcut-check any practice problem yourself before calling `explain`.",
			"When the learner submits a final answer, grade their words strictly against `committedAnswer` — never soften a wrong verdict or move the goalposts to be kind. Name exactly which steps/concepts landed and where the first break occurred.",
			"If the result comes back with `requestedHint: true`, the learner has NOT seen `committedAnswer` yet: diagnose the first stall in their working trace and give ONE minimal hint rung (R0 attention redirect → R1 pattern re-description → R2 candidate class → R3 proposition named → R4 move outlined → R5 worked step), then re-pose `explain` with the same `committedAnswer`.",
			"If the result comes back with `askFirst: true`, clarify the wording/question without spoiling `committedAnswer`, then re-pose `explain`.",
		],
		parameters: ExplainParams,

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const question = params.question.trim();
			const context = params.details?.trim() || undefined;
			const committedAnswer = params.committedAnswer.trim();
			const questionType = params.type as ExplainRole | undefined;

			if (!committedAnswer) {
				return {
					content: [
						{
							type: "text" as const,
							text: "explain requires a non-empty `committedAnswer` committed before posing the question.",
						},
					],
					details: {
						status: "unavailable",
						questionType,
						question,
						context,
						message: "committedAnswer is required",
					} satisfies ExplainResultDetails,
				};
			}

			if (signal?.aborted) {
				return {
					content: [{ type: "text" as const, text: "User cancelled the explain prompt." }],
					details: {
						status: "cancelled",
						questionType,
						question,
						context,
						message: "User cancelled",
					} satisfies ExplainResultDetails,
				};
			}

			if (!ctx.hasUI) {
				return {
					content: [{ type: "text" as const, text: "explain requires interactive mode UI" }],
					details: {
						status: "unavailable",
						questionType,
						question,
						context,
						message: "explain requires interactive mode UI",
					} satisfies ExplainResultDetails,
				};
			}

			return withUILock(async () => {
				const response = await askFreeRecall(ctx, question, context, committedAnswer, questionType);
				if (!response) {
					return {
						content: [{ type: "text" as const, text: "User cancelled the explain prompt." }],
						details: {
							status: "cancelled",
							questionType,
							question,
							context,
							message: "User cancelled",
						} satisfies ExplainResultDetails,
					};
				}

				if (response.askFirst) {
					const qText = response.text || "(User paused to ask a clarifying question)";
					const text =
						`User paused the prompt to ask a clarifying question BEFORE answering (the committedAnswer has NOT been revealed to them — clarify their question without spoiling the answer, then re-pose \`explain\`):\n` +
						`User's question: ${qText}`;
					return {
						content: [{ type: "text" as const, text }],
						details: {
							status: "answered",
							questionType,
							question,
							context,
							text: response.text,
							askFirst: true,
						} satisfies ExplainResultDetails,
					};
				}

				if (response.requestedHint) {
					const trace = response.text || "(No working trace written — user clicked 'I'm stuck / Ask for hint')";
					const text =
						`User requested a hint / work-check while working on the problem (the committedAnswer has NOT been revealed to them yet).\n` +
						`User's working trace so far:\n${trace}\n\n` +
						`Your committed reference solution (still hidden from learner):\n${committedAnswer}\n\n` +
						`Diagnose the first stall or wrong assumption in their trace and give ONE minimal hint (R0→R5 Hint Ladder) without giving away the answer, then call \`explain\` again so they can continue.`;
					return {
						content: [{ type: "text" as const, text }],
						details: {
							status: "answered",
							questionType,
							question,
							context,
							text: response.text,
							requestedHint: true,
						} satisfies ExplainResultDetails,
					};
				}

				if (response.dontKnow) {
					const text =
						`User selected "I don't know" (genuine gap — the committed reference answer has now been revealed to them).\n` +
						(response.text ? `User's notes: ${response.text}\n` : "") +
						`Committed reference answer:\n${committedAnswer}`;
					return {
						content: [{ type: "text" as const, text }],
						details: {
							status: "answered",
							questionType,
							question,
							context,
							text: response.text,
							committedAnswer,
							dontKnow: true,
						} satisfies ExplainResultDetails,
					};
				}

				const text =
					`User submitted their free-recall response (the committed reference answer has now been revealed to them).\n` +
					`User's response:\n${response.text}\n\n` +
					`Your pre-committed reference answer:\n${committedAnswer}\n\n` +
					`Grade the user's response strictly against your pre-committed answer (🔴 Critical misconception / 🟡 Incomplete or fuzzy / 🟢 Solid & locked in) — credit what worked, localize any break, and never soften a wrong verdict.`;
				return {
					content: [{ type: "text" as const, text }],
					details: {
						status: "answered",
						questionType,
						question,
						context,
						text: response.text,
						committedAnswer,
						dontKnow: false,
					} satisfies ExplainResultDetails,
				};
			});
		},

		renderCall(args, theme) {
			// NEVER render committedAnswer here — it would leak the solution before the user responds!
			const rolePrefix = args.type ? `[${String(args.type)}] ` : "";
			const text =
				theme.fg("toolTitle", theme.bold("explain ")) +
				theme.fg("accent", rolePrefix) +
				theme.fg("muted", renderTerminalMath(args.question));
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as ExplainResultDetails | undefined;
			if (!details) {
				const first = result.content[0];
				return new Text(first?.type === "text" ? first.text : "", 0, 0);
			}

			if (details.status === "cancelled") {
				return new Text(theme.fg("warning", details.message || "Cancelled"), 0, 0);
			}
			if (details.status === "unavailable") {
				return new Text(theme.fg("warning", details.message || "explain unavailable"), 0, 0);
			}
			if (details.askFirst) {
				const q = details.text ? renderTerminalMath(details.text) : "(paused to ask a clarifying question)";
				return new Text(theme.fg("accent", `💬 Clarifying question before answering: ${q}`), 0, 0);
			}
			if (details.requestedHint) {
				const trace = details.text
					? renderTerminalMath(details.text)
					: "(requested a hint with no working trace yet)";
				return new Text(theme.fg("warning", `💡 Requested hint / work check: ${trace}`), 0, 0);
			}

			const lines: string[] = [];
			if (details.dontKnow) {
				lines.push(theme.fg("warning", "· I don't know"));
				if (details.text) {
					lines.push(theme.fg("muted", `Notes: ${renderTerminalMath(details.text)}`));
				}
			} else if (details.text) {
				lines.push(theme.fg("accent", `Your response: ${renderTerminalMath(details.text)}`));
			}
			if (details.committedAnswer) {
				lines.push(theme.fg("success", `Reference: ${renderTerminalMath(details.committedAnswer)}`));
			}
			return new Text(lines.join("\n"), 0, 0);
		},
	});
}
