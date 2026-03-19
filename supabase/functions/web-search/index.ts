import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query) {
      return new Response(JSON.stringify({ error: 'Query required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];

    // 1. Google News RSS for fresh results
    try {
      const gnUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ar&gl=SA&ceid=SA:ar`;
      const gnRes = await fetch(gnUrl, { headers: { "User-Agent": "Ro-Search/1.0" } });
      if (gnRes.ok) {
        const xml = await gnRes.text();
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        let count = 0;
        while ((match = itemRegex.exec(xml)) !== null && count < 3) {
          const itemXml = match[1];
          const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') || "";
          const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || "";
          const sourceMatch = itemXml.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || "";
          if (title && link) {
            results.push({
              title: title.replace(/<[^>]*>/g, '').trim(),
              snippet: title.replace(/<[^>]*>/g, '').trim(),
              url: link.trim(),
              source: sourceMatch || "Google News",
            });
            count++;
          }
        }
      }
    } catch (e) {
      console.error('Google News failed:', e);
    }

    // 2. DuckDuckGo API
    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=ro-search`;
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
      if (ddgData.Answer) {
        results.push({ title: query, snippet: ddgData.Answer, url: "", source: "DuckDuckGo" });
      }
      if (ddgData.RelatedTopics) {
        for (const topic of ddgData.RelatedTopics.slice(0, 3)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.substring(0, 80),
              snippet: topic.Text,
              url: topic.FirstURL,
              source: new URL(topic.FirstURL).hostname.replace('www.', ''),
            });
          }
        }
      }
    } catch {}

    // 3. Arabic Wikipedia
    try {
      const wikiUrl = `https://ar.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=2&utf8=`;
      const wikiRes = await fetch(wikiUrl);
      const wikiData = await wikiRes.json();
      if (wikiData.query?.search) {
        for (const item of wikiData.query.search) {
          const snippet = item.snippet.replace(/<[^>]*>/g, '').trim();
          if (snippet) {
            results.push({
              title: item.title,
              snippet,
              url: `https://ar.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
              source: "Wikipedia",
            });
          }
        }
      }
    } catch {}

    // 4. English Wikipedia
    if (results.length < 5) {
      try {
        const wikiEnUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=2&utf8=`;
        const wikiEnRes = await fetch(wikiEnUrl);
        const wikiEnData = await wikiEnRes.json();
        if (wikiEnData.query?.search) {
          for (const item of wikiEnData.query.search) {
            const snippet = item.snippet.replace(/<[^>]*>/g, '').trim();
            if (snippet) {
              results.push({
                title: item.title,
                snippet,
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
                source: "Wikipedia (EN)",
              });
            }
          }
        }
      } catch {}
    }

    // Deduplicate
    const seen = new Set();
    const unique = results.filter(r => {
      const key = r.url || r.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return new Response(JSON.stringify({ results: unique.slice(0, 8) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Search error:', error);
    return new Response(JSON.stringify({ error: 'Search failed', results: [] }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
