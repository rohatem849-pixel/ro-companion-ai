import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    if (!query) {
      return new Response(JSON.stringify({ error: 'Query required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use DuckDuckGo instant answer API (free, no key needed)
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const ddgRes = await fetch(ddgUrl);
    const ddgData = await ddgRes.json();

    const results: any[] = [];

    if (ddgData.AbstractText) {
      results.push({
        title: ddgData.Heading || query,
        snippet: ddgData.AbstractText,
        url: ddgData.AbstractURL || "",
        source: ddgData.AbstractSource || "DuckDuckGo",
      });
    }

    if (ddgData.RelatedTopics) {
      for (const topic of ddgData.RelatedTopics.slice(0, 4)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.substring(0, 80),
            snippet: topic.Text,
            url: topic.FirstURL,
            source: "DuckDuckGo",
          });
        }
      }
    }

    // Also try Wikipedia API for more info
    try {
      const wikiUrl = `https://ar.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
      const wikiRes = await fetch(wikiUrl);
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        if (wikiData.extract) {
          results.unshift({
            title: wikiData.title || query,
            snippet: wikiData.extract,
            url: wikiData.content_urls?.desktop?.page || "",
            source: "Wikipedia",
          });
        }
      }
    } catch {}

    // Try English Wikipedia too
    try {
      const wikiEnUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
      const wikiEnRes = await fetch(wikiEnUrl);
      if (wikiEnRes.ok) {
        const wikiEnData = await wikiEnRes.json();
        if (wikiEnData.extract && results.length < 3) {
          results.push({
            title: wikiEnData.title || query,
            snippet: wikiEnData.extract,
            url: wikiEnData.content_urls?.desktop?.page || "",
            source: "Wikipedia (EN)",
          });
        }
      }
    } catch {}

    return new Response(JSON.stringify({ results: results.slice(0, 5) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Search error:', error);
    return new Response(JSON.stringify({ error: 'Search failed', results: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
