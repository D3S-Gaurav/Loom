import { z } from "zod";
import { boundContext, boundContextSections } from "../swarm/tokenBudget";

const SEARCH_ENDPOINT = "https://api.firecrawl.dev/v2/search";
const SEARCH_TIMEOUT_MS = 15_000;
const MAX_QUERY_CHARS = 1_200;
const MAX_RESULT_CONTEXT_CHARS = 12_000;
const MAX_SOURCE_EXCERPT_CHARS = 2_400;

const searchResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    web: z.array(z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      url: z.string(),
      markdown: z.string().optional(),
    }).passthrough()).default([]),
  }).passthrough(),
}).passthrough();

export type WebResearch = {
  status: "ready" | "unconfigured" | "unavailable";
  context: string;
  sourceCount: number;
};

function safeWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanLabel(value: string | undefined, fallback: string) {
  return (value ?? fallback)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\[\]]/g, "")
    .trim()
    .slice(0, 180) || fallback;
}

export async function searchWeb(query: string, signal?: AbortSignal): Promise<WebResearch> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: "unconfigured",
      sourceCount: 0,
      context:
        "Live web search is not configured for this Loom deployment. State this limitation " +
        "plainly and do not describe model knowledge as current web research.",
    };
  }

  const timeoutSignal = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await fetch(SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: boundContext(query.trim(), MAX_QUERY_CHARS),
        sources: ["web"],
        limit: 5,
        scrapeOptions: {
          formats: ["markdown"],
          onlyMainContent: true,
        },
      }),
      cache: "no-store",
      signal: requestSignal,
    });

    if (!response.ok) throw new Error(`Firecrawl search returned HTTP ${response.status}.`);

    const parsed = searchResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("Firecrawl returned an invalid search response.");

    const sources = parsed.data.data.web.flatMap((result) => {
      const url = safeWebUrl(result.url);
      if (!url) return [];
      const hostname = new URL(url).hostname;
      const title = cleanLabel(result.title, hostname);
      const excerpt = [result.description, result.markdown]
        .filter(Boolean)
        .join("\n\n")
        .trim();

      return [{
        heading: `### [${title}](${url})`,
        body: boundContext(excerpt || "No excerpt returned; use the linked source only.", MAX_SOURCE_EXCERPT_CHARS),
      }];
    });

    if (!sources.length) throw new Error("Firecrawl returned no usable web sources.");

    return {
      status: "ready",
      sourceCount: sources.length,
      context: boundContextSections(sources, MAX_RESULT_CONTEXT_CHARS),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    console.error("Research search unavailable", error);
    return {
      status: "unavailable",
      sourceCount: 0,
      context:
        "Live web search was unavailable for this task. State this limitation plainly and do not " +
        "invent sources, citations, browsing activity, or claims of current verification.",
    };
  }
}
