import { supabase } from "@/integrations/supabase/client";

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
}

export async function searchWeb(query: string): Promise<SearchResult[]> {
  try {
    const { data, error } = await supabase.functions.invoke('web-search', {
      body: { query },
    });
    if (error) {
      console.warn('Search error:', error);
      return [];
    }
    return data?.results || [];
  } catch (err) {
    console.warn('Search failed:', err);
    return [];
  }
}

// Detect if a message likely needs web search
export function needsWebSearch(text: string): boolean {
  const searchIndicators = [
    /من (هو|هي|هم) /,
    /ما (هو|هي|هم|معنى|سبب) /,
    /كم (عدد|سعر|ثمن|مبلغ)/,
    /متى (حدث|بدأ|انتهى|سيكون)/,
    /أين (يقع|يوجد|تقع)/,
    /هل (يوجد|هناك|صحيح)/,
    /سعر|أسعار|تكلفة/,
    /رئيس|وزير|ملك|حاكم/,
    /آخر (أخبار|تحديث|خبر)/,
    /أخبار|حدث|اليوم/,
    /أحدث|جديد|حالي|الآن/,
    /عاصمة|عدد سكان/,
    /تاريخ|في عام|سنة/,
    /كيف (أستخدم|يعمل|أقدر)/,
    /ابحث|بحث|search/i,
    /what is|who is|when|where|how much|price/i,
  ];
  return searchIndicators.some(r => r.test(text));
}
