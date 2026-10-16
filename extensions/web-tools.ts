import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function decodeHtmlEntities(str: string): string {
	return str
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripTags(html: string): string {
	return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "))
		.replace(/\s+/g, " ")
		.trim();
}

function resolveDdgUrl(rawHref: string): string {
	const decoded = decodeHtmlEntities(rawHref);
	try {
		const urlObj = new URL(decoded, "https://html.duckduckgo.com");
		const uddg = urlObj.searchParams.get("uddg");
		if (uddg) return uddg;
		return urlObj.toString();
	} catch {
		return decoded;
	}
}

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

async function searchDuckDuckGo(query: string, maxResults = 8): Promise<SearchResult[]> {
	const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
	const res = await fetch(url, {
		headers: {
			"User-Agent": USER_AGENT,
			Accept: "text/html,application/xhtml+xml",
			"Accept-Language": "en-US,en;q=0.9",
		},
		signal: AbortSignal.timeout(15000),
	});
	if (!res.ok) {
		throw new Error(`Search HTTP ${res.status}: ${res.statusText}`);
	}
	const html = await res.text();
	const results: SearchResult[] = [];

	const blockRegex = /<div[^>]+class="[^"]*\bresult__body\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
	let match: RegExpExecArray | null;
	while ((match = blockRegex.exec(html)) !== null && results.length < maxResults) {
		const block = match[1];
		const linkMatch = /<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
		if (!linkMatch) continue;
		const resolvedUrl = resolveDdgUrl(linkMatch[1]);
		const title = stripTags(linkMatch[2]);
		const snippetMatch = /<a[^>]+class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
		const snippet = snippetMatch ? stripTags(snippetMatch[1]) : "";
		if (title && resolvedUrl) {
			results.push({ title, url: resolvedUrl, snippet });
		}
	}

	// Fallback if DDG layout shifts slightly
	if (results.length === 0) {
		const linkRegex = /<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
		let lm: RegExpExecArray | null;
		while ((lm = linkRegex.exec(html)) !== null && results.length < maxResults) {
			const resolvedUrl = resolveDdgUrl(lm[1]);
			const title = stripTags(lm[2]);
			if (title && resolvedUrl) {
				results.push({ title, url: resolvedUrl, snippet: "" });
			}
		}
	}

	return results;
}

function htmlToReadableText(html: string): string {
	let cleaned = html
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<(script|style|noscript|svg|iframe|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, "")
		.replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, "\n\n## $2\n")
		.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
		.replace(/<(p|div|section|article|blockquote|tr|br)[^>]*>/gi, "\n")
		.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "\n```\n$1\n```\n")
		.replace(/<[^>]+>/g, " ");

	cleaned = decodeHtmlEntities(cleaned);
	return cleaned
		.split("\n")
		.map((line) => line.replace(/[ \t]+/g, " ").trim())
		.filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
		.join("\n")
		.trim();
}

export default function webTools(pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "web_search",
		description: "Search the web for current information, documentation, and primary sources.",
		parameters: Type.Object({
			query: Type.Optional(Type.String({ description: "Search query string." })),
			queries: Type.Optional(Type.Array(Type.String(), { description: "Optional list of search queries." })),
			max_results: Type.Optional(Type.Number({ description: "Max results per query (default 6)." })),
		}),
		async execute(_toolCallId, params) {
			const queryList: string[] = [];
			if (typeof params.query === "string" && params.query.trim()) {
				queryList.push(params.query.trim());
			}
			if (Array.isArray(params.queries)) {
				for (const q of params.queries) {
					if (typeof q === "string" && q.trim()) queryList.push(q.trim());
				}
			}
			if (queryList.length === 0) {
				return {
					content: [{ type: "text", text: "Error: provide `query` or `queries` to search." }],
					isError: true,
				};
			}

			const maxResults = Math.min(Math.max(Number(params.max_results) || 6, 1), 15);
			const sections: string[] = [];

			for (const q of queryList) {
				try {
					const results = await searchDuckDuckGo(q, maxResults);
					if (results.length === 0) {
						sections.push(`### Query: ${q}\nNo results found.`);
					} else {
						const formatted = results
							.map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}${r.snippet ? `\n   ${r.snippet}` : ""}`)
							.join("\n\n");
						sections.push(`### Query: ${q}\n\n${formatted}`);
					}
				} catch (err: any) {
					sections.push(`### Query: ${q}\nSearch error: ${err?.message || err}`);
				}
			}

			return {
				content: [{ type: "text", text: sections.join("\n\n---\n\n") }],
			};
		},
	});

	pi.registerTool({
		name: "web_fetch",
		label: "web_fetch",
		description: "Fetch the full readable text content of a web page URL.",
		parameters: Type.Object({
			url: Type.String({ description: "The HTTP/HTTPS URL to fetch." }),
			max_length: Type.Optional(Type.Number({ description: "Maximum characters to return (default 20000)." })),
		}),
		async execute(_toolCallId, params) {
			const targetUrl = String(params.url || "").trim();
			if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
				return {
					content: [{ type: "text", text: `Invalid URL: ${targetUrl}` }],
					isError: true,
				};
			}
			const maxLen = Math.min(Math.max(Number(params.max_length) || 20000, 1000), 100000);
			try {
				const res = await fetch(targetUrl, {
					headers: {
						"User-Agent": USER_AGENT,
						Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8",
					},
					signal: AbortSignal.timeout(20000),
				});
				if (!res.ok) {
					return {
						content: [{ type: "text", text: `HTTP ${res.status} (${res.statusText}) fetching ${targetUrl}` }],
						isError: true,
					};
				}
				const contentType = res.headers.get("content-type") || "";
				const raw = await res.text();
				const text = contentType.includes("html") ? htmlToReadableText(raw) : raw.trim();
				const truncated =
					text.length > maxLen ? `${text.slice(0, maxLen)}\n\n[...truncated at ${maxLen} chars]` : text;
				return {
					content: [{ type: "text", text: `Source: ${targetUrl}\n\n${truncated}` }],
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Error fetching ${targetUrl}: ${err?.message || err}` }],
					isError: true,
				};
			}
		},
	});
}
