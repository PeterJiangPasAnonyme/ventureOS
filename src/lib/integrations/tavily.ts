export interface WebResult {
  title: string;
  url: string;
  content: string;
}

export function hasTavily(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

/**
 * Web research via Tavily. Falls back to a clearly-labelled deterministic stub
 * when TAVILY_API_KEY is not set, so the competitive-analysis copilot still
 * produces a coherent (if synthetic) result during offline demos.
 */
export async function webSearch(
  query: string,
  maxResults = 5
): Promise<{ results: WebResult[]; configured: boolean }> {
  if (!hasTavily()) {
    return {
      configured: false,
      results: [
        {
          title: `[Demo] Overview: ${query}`,
          url: "https://example.com/demo",
          content: `Web search is running in demo mode (no TAVILY_API_KEY set). In production this returns live results for "${query}" from Tavily. Add a key in Integrations to enable real external research.`,
        },
      ],
    };
  }

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: maxResults,
        search_depth: "advanced",
      }),
    });
    if (!res.ok) throw new Error(`Tavily ${res.status}`);
    const data = (await res.json()) as {
      results?: { title: string; url: string; content: string }[];
    };
    return {
      configured: true,
      results: (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
      })),
    };
  } catch (err) {
    console.error("webSearch failed:", err);
    return { configured: true, results: [] };
  }
}
