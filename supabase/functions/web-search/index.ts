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

    const results: any[] = [];

    // Try multiple sources for best results

    // 1. DuckDuckGo HTML search for fresh results
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const ddgRes = await fetch(ddgUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RoBot/1.0)' },
      });
      const html = await ddgRes.text();
      
      // Parse results from HTML
      const resultRegex = /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let match;
      let count = 0;
      while ((match = resultRegex.exec(html)) !== null && count < 5) {
        const url = match[1];
        const title = match[2].replace(/<[^>]*>/g, '').trim();
        const snippet = match[3].replace(/<[^>]*>/g, '').trim();
        if (title && snippet && url) {
          try {
            const parsedUrl = new URL(url.startsWith('//') ? 'https:' + url : url);
            results.push({
              title,
              snippet,
              url: parsedUrl.toString(),
              source: parsedUrl.hostname.replace('www.', ''),
            });
            count++;
          } catch {}
        }
      }
    } catch (e) {
      console.error('DDG HTML search failed:', e);
    }

    // 2. Fallback: DuckDuckGo instant answer API
    if (results.length < 3) {
      try {
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const ddgRes = await fetch(ddgUrl);
        const ddgData = await ddgRes.json();

        if (ddgData.AbstractText) {
          results.push({
            title: ddgData.Heading || query,
            snippet: ddgData.AbstractText,
            url: ddgData.AbstractURL || "",
            source: ddgData.AbstractSource || "DuckDuckGo",
          });
        }

        if (ddgData.RelatedTopics) {
          for (const topic of ddgData.RelatedTopics.slice(0, 3)) {
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
      } catch {}
    }

    // 3. Wikipedia for context
    if (results.length < 5) {
      try {
        const wikiUrl = `https://ar.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
        const wikiRes = await fetch(wikiUrl);
        if (wikiRes.ok) {
          const wikiData = await wikiRes.json();
          if (wikiData.extract) {
            results.push({
              title: wikiData.title || query,
              snippet: wikiData.extract,
              url: wikiData.content_urls?.desktop?.page || "",
              source: "Wikipedia",
            });
          }
        }
      } catch {}
    }

    // Deduplicate by URL
    const seen = new Set();
    const unique = results.filter(r => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    return new Response(JSON.stringify({ results: unique.slice(0, 6) }), {
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
