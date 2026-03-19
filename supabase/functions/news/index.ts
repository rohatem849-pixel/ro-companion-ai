import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractRssItems(xml: string, source: string, maxItems = 8): any[] {
  const items: any[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const itemXml = match[1];
    const title = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/)?.[1] || itemXml.match(/<title>(.*?)<\/title>/)?.[1] || "";
    const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || "";
    const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
    const category = itemXml.match(/<category><!\[CDATA\[(.*?)\]\]>|<category>(.*?)<\/category>/)?.[1] || itemXml.match(/<category>(.*?)<\/category>/)?.[1] || "";

    if (title && link) {
      // Filter: only recent news (within last 24 hours)
      const pubTime = new Date(pubDate).getTime();
      const now = Date.now();
      const hoursDiff = (now - pubTime) / (1000 * 60 * 60);
      
      if (hoursDiff <= 24 || !pubDate) {
        items.push({
          title: title.replace(/<[^>]*>/g, "").trim(),
          link: link.trim(),
          source,
          pubDate,
          category: category.replace(/<[^>]*>/g, "").trim() || undefined,
        });
      }
    }
  }
  return items;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { country, hobbies } = await req.json();
    
    const feeds = [
      { url: "https://www.alarabiya.net/feed/rss2", source: "العربية" },
      { url: "https://feeds.bbci.co.uk/arabic/rss.xml", source: "BBC عربي" },
    ];

    const allArticles: any[] = [];

    // Fetch all feeds in parallel
    const results = await Promise.allSettled(
      feeds.map(async (feed) => {
        try {
          const res = await fetch(feed.url, {
            headers: { "User-Agent": "Ro-News-Bot/1.0" },
          });
          if (!res.ok) return [];
          const xml = await res.text();
          return extractRssItems(xml, feed.source);
        } catch {
          return [];
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allArticles.push(...result.value);
      }
    }

    // Also try Google News RSS for country-specific news
    if (country) {
      try {
        const gnUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(country)}&hl=ar&gl=SA&ceid=SA:ar`;
        const gnRes = await fetch(gnUrl, {
          headers: { "User-Agent": "Ro-News-Bot/1.0" },
        });
        if (gnRes.ok) {
          const xml = await gnRes.text();
          const gnItems = extractRssItems(xml, "Google News", 5);
          allArticles.push(...gnItems);
        }
      } catch {}
    }

    // Sort by pubDate (newest first) and deduplicate
    const seen = new Set<string>();
    const unique = allArticles
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .filter(item => {
        if (seen.has(item.title)) return false;
        seen.add(item.title);
        return true;
      })
      .slice(0, 15);

    return new Response(JSON.stringify({ articles: unique }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("News error:", error);
    return new Response(JSON.stringify({ articles: [], error: "Failed to fetch news" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
