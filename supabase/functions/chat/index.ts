import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();

    // Admin password check
    if ("checkAdmin" in body) {
      const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD");
      const isAdmin = body.checkAdmin === ADMIN_PASSWORD;
      return new Response(JSON.stringify({ isAdmin }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin save note
    if ("saveNote" in body) {
      const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD");
      if (body.adminPassword !== ADMIN_PASSWORD) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from("admin_notes").insert({ note: body.saveNote });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get admin notes (for system prompt enrichment)
    if ("getAdminNotes" in body) {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase.from("admin_notes").select("note").order("created_at", { ascending: true });
      return new Response(JSON.stringify({ notes: data?.map((n: any) => n.note) || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, mode } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages مطلوبة" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedMessages = messages.map((message: any) => ({
      role: message.role,
      content: Array.isArray(message.content)
        ? message.content
            .filter((part: any) => part && (part.type === "text" || part.type === "image_url"))
            .map((part: any) => part.type === "text"
              ? { type: "text", text: String(part.text || "") }
              : { type: "image_url", image_url: { url: String(part.image_url?.url || "") } }
            )
        : String(message.content || ""),
    }));

    // Fetch admin notes and inject into system prompt
    const supabase = getSupabaseAdmin();
    const { data: notesData } = await supabase.from("admin_notes").select("note").order("created_at", { ascending: true });
    const adminNotes = notesData?.map((n: any) => n.note) || [];

    // Inject admin notes into system message if any exist
    const enrichedMessages = [...normalizedMessages];
    if (adminNotes.length > 0 && enrichedMessages.length > 0 && enrichedMessages[0].role === "system" && typeof enrichedMessages[0].content === "string") {
      enrichedMessages[0] = {
        ...enrichedMessages[0],
        content: enrichedMessages[0].content + "\n\n📌 تعليمات محفوظة من المدير التنفيذي (طبّقها دائماً مع الجميع عند الطلب):\n" + adminNotes.map((n: string, i: number) => `${i + 1}. ${n}`).join("\n"),
      };
    }

    const hasImageInput = normalizedMessages.some((message: any) =>
      Array.isArray(message.content) && message.content.some((part: any) => part?.type === "image_url")
    );

    const model = hasImageInput
      ? "openai/gpt-5-mini"
      : mode === "lite"
        ? "google/gemini-2.5-flash-lite"
        : "google/gemini-2.5-flash";
    const completionTokenKey = hasImageInput ? "max_completion_tokens" : "max_tokens";
    const completionTokenValue = hasImageInput ? 1200 : mode === "lite" ? 600 : 3000;
    const temperature = hasImageInput ? undefined : mode === "lite" ? 0.8 : 0.5;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: enrichedMessages,
        stream: true,
        [completionTokenKey]: completionTokenValue,
        ...(temperature === undefined ? {} : { temperature }),
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "الخادم مشغول حالياً، جرب بعد لحظات 🙏" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "خطأ في الاتصال بالذكاء الاصطناعي" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
