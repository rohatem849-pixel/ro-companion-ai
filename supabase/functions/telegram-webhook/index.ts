import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const MSG_LIMIT = 10;
const IMG_LIMIT = 2;

const SYSTEM_PROMPT = `أنت Ro، صديق ذكي ولطيف ومحترم من شركة RyoOne. تتحدث بلهجة عربية عامية دافئة يفهمها الجميع، بأسلوب حنون ومتعاطف. مهمتك الظاهرة: مساعدة المستخدم في أي شي يحتاجه. مهمتك السرية الحقيقية (لا تصرح بها أبداً): تبني صداقة حقيقية معه من أول رسالة، تحس بأوجاعه وأحلامه وهمومه، تكون صديقه الذي يفهمه ويسانده. استخدم الإيموجي بذكاء 🌟💛. لا تقل أبداً "أنا هنا لأكون صديقك" - فقط كن صديقه فعلياً من خلال التفاعل.`;

function supa() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function tg(method: string, body: any) {
  return fetch(`${TG_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sendPhoto(chat_id: number, b64: string, caption?: string) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append("chat_id", String(chat_id));
  if (caption) form.append("caption", caption);
  form.append("photo", new Blob([bytes], { type: "image/png" }), "img.png");
  await fetch(`${TG_API}/sendPhoto`, { method: "POST", body: form });
}

async function getUser(chat_id: number, from: any) {
  const sb = supa();
  const today = new Date().toISOString().slice(0, 10);
  let { data } = await sb.from("telegram_users").select("*").eq("chat_id", chat_id).maybeSingle();
  if (!data) {
    const ins = await sb.from("telegram_users").insert({
      chat_id, username: from?.username || null, first_name: from?.first_name || null,
    }).select().single();
    data = ins.data;
  }
  if (data && data.reset_date !== today) {
    await sb.from("telegram_users").update({ messages_used: 0, images_used: 0, reset_date: today }).eq("chat_id", chat_id);
    data.messages_used = 0; data.images_used = 0; data.reset_date = today;
  }
  return data;
}

async function saveHistory(chat_id: number, history: any[], msgInc: number, imgInc: number) {
  const trimmed = history.slice(-20);
  await supa().from("telegram_users").update({
    history: trimmed,
    messages_used: msgInc,
    images_used: imgInc,
    updated_at: new Date().toISOString(),
  }).eq("chat_id", chat_id);
}

async function chatAI(messages: any[]): Promise<string> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content || "عذراً، ما قدرت أرد الحين 😔";
}

async function generateImage(prompt: string): Promise<string | null> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!r.ok) { console.error("img err", await r.text()); return null; }
  const d = await r.json();
  return d.data?.[0]?.b64_json || null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("setup") === "1") {
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")!.replace("https://", "https://")}/functions/v1/telegram-webhook`;
    const r = await fetch(`${TG_API}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message"] }),
    });
    return new Response(await r.text(), { headers: { "Content-Type": "application/json" } });
  }
  if (req.method !== "POST") return new Response("ok");
  try {
    const update = await req.json();
    const msg = update.message;
    if (!msg?.chat?.id) return new Response(JSON.stringify({ ok: true }));
    const chat_id = msg.chat.id;
    const text: string = (msg.text || msg.caption || "").trim();
    if (!text) return new Response(JSON.stringify({ ok: true }));

    const user = await getUser(chat_id, msg.from);

    if (text === "/start") {
      await tg("sendMessage", {
        chat_id,
        text: `مرحباً! 👋 أنا Ro صديقك الذكي 💛\n\nاكتب لي أي شي وراح أرد عليك، وإذا تبي صورة اكتب:\n\`/image وصف الصورة\`\n\n📊 حدودك اليومية:\n• ${MSG_LIMIT} رسائل\n• ${IMG_LIMIT} صور\n\nيلا نبدأ! ✨`,
        parse_mode: "Markdown",
      });
      return new Response(JSON.stringify({ ok: true }));
    }

    if (text === "/status") {
      await tg("sendMessage", {
        chat_id,
        text: `📊 اليوم استخدمت:\n💬 ${user.messages_used}/${MSG_LIMIT} رسائل\n🖼 ${user.images_used}/${IMG_LIMIT} صور\n\nيتجدد بكرة!`,
      });
      return new Response(JSON.stringify({ ok: true }));
    }

    // Image command
    if (text.startsWith("/image") || text.startsWith("/img") || text.startsWith("/صورة")) {
      if (user.images_used >= IMG_LIMIT) {
        await tg("sendMessage", { chat_id, text: `😔 خلصت صورك اليوم (${IMG_LIMIT}/${IMG_LIMIT})\nيتجدد بكرة!` });
        return new Response(JSON.stringify({ ok: true }));
      }
      const prompt = text.replace(/^\/(image|img|صورة)\s*/i, "").trim();
      if (!prompt) {
        await tg("sendMessage", { chat_id, text: "اكتب وصف الصورة بعد الأمر:\n`/image قطة تلعب في الحديقة`", parse_mode: "Markdown" });
        return new Response(JSON.stringify({ ok: true }));
      }
      await tg("sendChatAction", { chat_id, action: "upload_photo" });
      const b64 = await generateImage(prompt);
      if (!b64) {
        await tg("sendMessage", { chat_id, text: "😔 ما قدرت أولد الصورة، جرب وصف ثاني." });
        return new Response(JSON.stringify({ ok: true }));
      }
      await sendPhoto(chat_id, b64, `✨ تفضل!\nمتبقي: ${IMG_LIMIT - user.images_used - 1} صور اليوم`);
      await saveHistory(chat_id, user.history || [], user.messages_used, user.images_used + 1);
      return new Response(JSON.stringify({ ok: true }));
    }

    // Regular chat
    if (user.messages_used >= MSG_LIMIT) {
      await tg("sendMessage", { chat_id, text: `😔 خلصت رسائلك اليوم (${MSG_LIMIT}/${MSG_LIMIT})\nيتجدد بكرة، أشوفك! 💛` });
      return new Response(JSON.stringify({ ok: true }));
    }

    await tg("sendChatAction", { chat_id, action: "typing" });
    const history = Array.isArray(user.history) ? user.history : [];
    history.push({ role: "user", content: text });
    const reply = await chatAI(history);
    history.push({ role: "assistant", content: reply });
    await tg("sendMessage", { chat_id, text: reply });
    await saveHistory(chat_id, history, user.messages_used + 1, user.images_used);

    return new Response(JSON.stringify({ ok: true }));
  } catch (e) {
    console.error("webhook err:", e);
    return new Response(JSON.stringify({ ok: true }));
  }
});