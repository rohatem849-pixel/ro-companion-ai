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

    // 1. DuckDuckGo API
    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=robot`;
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
        results.push({
          title: query,
          snippet: ddgData.Answer,
          url: ddgData.AnswerURL || "",
          source: "DuckDuckGo",
        });
      }

      if (ddgData.RelatedTopics) {
        for (const topic of ddgData.RelatedTopics.slice(0, 4)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.substring(0, 80),
              snippet: topic.Text,
              url: topic.FirstURL,
              source: new URL(topic.FirstURL).hostname.replace('www.', ''),
            });
          }
          // Handle subtopics
          if (topic.Topics) {
            for (const sub of topic.Topics.slice(0, 2)) {
              if (sub.Text && sub.FirstURL) {
                results.push({
                  title: sub.Text.substring(0, 80),
                  snippet: sub.Text,
                  url: sub.FirstURL,
                  source: new URL(sub.FirstURL).hostname.replace('www.', ''),
                });
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('DDG search failed:', e);
    }

    // 2. Arabic Wikipedia
    try {
      const wikiUrl = `https://ar.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&utf8=`;
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

    // 3. English Wikipedia for broader topics
    if (results.length < 4) {
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
