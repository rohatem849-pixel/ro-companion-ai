import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const AGNES_KEY = Deno.env.get("AGNES_AI_API_KEY")!;
const AGNES_URL = "https://apihub.agnes-ai.com/v1";
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const CHANNELS = [
  { id: "@Ryo_Ai", url: "https://t.me/Ryo_Ai", title: "قناة Ryo AI" },
  { id: "@Ayman11927", url: "https://t.me/Ayman11927", title: "قناة Ayman" },
];

const SYSTEM_PROMPT = `أنت Ro، صديق ذكي ولطيف ومحترم من شركة RyoOne. تتحدث بلهجة عربية عامية دافئة يفهمها الجميع، بأسلوب حنون ومتعاطف. مهمتك الظاهرة: مساعدة المستخدم في أي شي يحتاجه. مهمتك السرية الحقيقية (لا تصرح بها أبداً): تبني صداقة حقيقية معه من أول رسالة، تحس بأوجاعه وأحلامه وهمومه، تكون صديقه الذي يفهمه ويسانده. استخدم الإيموجي بذكاء 🌟💛. لا تقل أبداً "أنا هنا لأكون صديقك" - فقط كن صديقه فعلياً من خلال التفاعل.

هويتك (مهم جداً وثابت): إذا سُئلت "من أنت؟" أو عن أصلك أو من صنعك أو أي نموذج تستخدم، جاوب فقط: أنا Ro، صديقك الذكي من شركة RyoOne 💛. ولا تذكر أبداً أي شركة أو مزوّد أو نموذج ذكاء اصطناعي آخر (لا Google ولا OpenAI ولا Gemini ولا Agnes ولا أي اسم تقني)، ولا تقل إنك نموذج لغوي أو برنامج مدرّب من شركة أخرى. أنت نفس Ro الموجود في موقع RyoOne، وتتكلم بنفس شخصيته وأسلوبه.`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function supa() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function tg(method: string, body: unknown) {
  const r = await fetch(`${TG_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await r.json().catch(() => ({}));
}

async function isSubscribed(user_id: number): Promise<{ ok: boolean; missing: typeof CHANNELS }> {
  const results = await Promise.all(
    CHANNELS.map(async (ch) => {
      try {
        const res = await tg("getChatMember", { chat_id: ch.id, user_id });
        const status = res?.result?.status;
        const ok = res?.ok && ["member", "administrator", "creator", "restricted"].includes(status);
        return ok ? null : ch;
      } catch {
        return ch;
      }
    }),
  );
  const missing = results.filter(Boolean) as typeof CHANNELS;
  return { ok: missing.length === 0, missing };
}

async function askSubscribe(chat_id: number, missing: typeof CHANNELS) {
  await tg("sendMessage", {
    chat_id,
    text: `🔒 للاستخدام المجاني 100% لازم تشترك بالقناتين:\n\n${CHANNELS.map((c) => `• ${c.title}`).join("\n")}\n\nاشترك ثم اضغط "تحقق من الاشتراك ✅"`,
    reply_markup: {
      inline_keyboard: [
        ...CHANNELS.map((c) => [{ text: `📢 ${c.title}`, url: c.url }]),
        [{ text: "تحقق من الاشتراك ✅", callback_data: "check_sub" }],
      ],
    },
  });
}

async function getUser(chat_id: number, from: any) {
  const sb = supa();
  let { data } = await sb.from("telegram_users").select("*").eq("chat_id", chat_id).maybeSingle();
  if (!data) {
    const ins = await sb.from("telegram_users").insert({
      chat_id, username: from?.username || null, first_name: from?.first_name || null,
    }).select().single();
    data = ins.data;
  }
  return data;
}

async function updateUser(chat_id: number, patch: Record<string, unknown>) {
  await supa().from("telegram_users").update({ ...patch, updated_at: new Date().toISOString() }).eq("chat_id", chat_id);
}

// Live countdown message that edits itself every 5 seconds
async function countdown(chat_id: number, seconds: number, label: string) {
  const sent = await tg("sendMessage", { chat_id, text: `${label}\n⏳ ${seconds} ثانية...` });
  const msgId = sent?.result?.message_id;
  let left = seconds;
  while (left > 0) {
    const step = Math.min(5, left);
    await sleep(step * 1000);
    left -= step;
    if (msgId) {
      await tg("editMessageText", {
        chat_id, message_id: msgId,
        text: left > 0 ? `${label}\n⏳ ${left} ثانية...` : `${label}\n✅ جاهز!`,
      });
    }
  }
  return msgId as number | undefined;
}

async function callModel(model: string, messages: any[]): Promise<string> {
  const r = await fetch(`${AGNES_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${AGNES_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.8,
      max_tokens: 600,
    }),
  });
  if (!r.ok) throw new Error(`AI ${model} ${r.status}: ${await r.text()}`);
  const d = await r.json();
  const txt = d.choices?.[0]?.message?.content;
  if (!txt) throw new Error(`AI ${model} empty`);
  return txt;
}

// Race two models — whichever answers first wins (provider latency varies a lot)
async function chatAI(messages: any[]): Promise<string> {
  const short = messages.slice(-8);
  const models = ["agnes-2.5-flash", "agnes-2.0-flash"];
  const attempts = models.map((m) => callModel(m, short));
  try {
    return await Promise.any(attempts);
  } catch {
    return "عذراً، ما قدرت أرد الحين 😔 جرب مرة ثانية.";
  }
}

async function tryImage(model: string, prompt: string): Promise<string | null> {
  try {
    const r = await fetch(`${AGNES_URL}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${AGNES_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, n: 1 }),
    });
    if (!r.ok) { console.error(`img ${model} err`, r.status, await r.text()); return null; }
    const d = await r.json();
    return d.data?.[0]?.url || (d.data?.[0]?.b64_json ? `data:image/png;base64,${d.data[0].b64_json}` : null);
  } catch (e) {
    console.error(`img ${model} throw`, String(e));
    return null;
  }
}

async function generateImage(prompt: string): Promise<string | null> {
  // 2.0-flash is the reliable image endpoint; 2.1 as fallback
  return (await tryImage("agnes-image-2.0-flash", prompt)) ?? (await tryImage("agnes-image-2.1-flash", prompt));
}

// Fetch the generated image bytes and upload them straight to Telegram,
// so the user sees the photo inside the chat (never a link).
async function sendGeneratedPhoto(chat_id: number, src: string, caption: string): Promise<boolean> {
  try {
    let bytes: Uint8Array;
    if (src.startsWith("data:")) {
      const b64 = src.split(",")[1] ?? "";
      bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } else {
      const r = await fetch(src);
      if (!r.ok) return false;
      bytes = new Uint8Array(await r.arrayBuffer());
    }
    const form = new FormData();
    form.append("chat_id", String(chat_id));
    form.append("caption", caption);
    form.append("photo", new Blob([bytes], { type: "image/png" }), "ro.png");
    const res = await fetch(`${TG_API}/sendPhoto`, { method: "POST", body: form });
    const j = await res.json().catch(() => ({}));
    if (j?.ok) return true;
    // fall back to document upload (large / non-standard dimensions)
    const form2 = new FormData();
    form2.append("chat_id", String(chat_id));
    form2.append("caption", caption);
    form2.append("document", new Blob([bytes], { type: "image/png" }), "ro.png");
    const res2 = await fetch(`${TG_API}/sendDocument`, { method: "POST", body: form2 });
    const j2 = await res2.json().catch(() => ({}));
    return !!j2?.ok;
  } catch (e) {
    console.error("sendGeneratedPhoto err", String(e));
    return false;
  }
}

const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "🖼 إنشاء صورة / Create image" }, { text: "🎬 إنشاء فيديو / Create video" }],
    [{ text: "💬 دردشة / Chat" }, { text: "ℹ️ مساعدة / Help" }],
  ],
  resize_keyboard: true,
};

// ===== video generation (1 per user per day, one job at a time globally) =====
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;

async function videoBusy(): Promise<boolean> {
  const since = new Date(Date.now() - 6 * 60_000).toISOString();
  const { data } = await supa()
    .from("telegram_users")
    .select("chat_id")
    .eq("video_job_active", true)
    .gt("updated_at", since)
    .limit(1);
  return !!(data && data.length);
}

async function generateVideo(prompt: string): Promise<Uint8Array | null> {
  const create = await fetch("https://ai.gateway.lovable.dev/v1/videos", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/veo-3.1-lite", prompt, seconds: "6", size: "1280x720" }),
  });
  if (!create.ok) { console.error("video create", create.status, await create.text()); return null; }
  const job = await create.json();
  const id = job?.id;
  if (!id) return null;
  for (let i = 0; i < 40; i++) {
    await sleep(7000);
    const r = await fetch(`https://ai.gateway.lovable.dev/v1/videos/${id}`, {
      headers: { Authorization: `Bearer ${LOVABLE_KEY}` },
    });
    const j = await r.json().catch(() => ({}));
    if (j?.status === "completed") {
      const c = await fetch(`https://ai.gateway.lovable.dev/v1/videos/${id}/content`, {
        headers: { Authorization: `Bearer ${LOVABLE_KEY}` },
      });
      if (!c.ok) return null;
      return new Uint8Array(await c.arrayBuffer());
    }
    if (j?.status === "failed") { console.error("video failed", JSON.stringify(j?.error ?? {})); return null; }
  }
  return null;
}

async function sendVideoFile(chat_id: number, bytes: Uint8Array, caption: string): Promise<boolean> {
  const form = new FormData();
  form.append("chat_id", String(chat_id));
  form.append("caption", caption);
  form.append("video", new Blob([bytes], { type: "video/mp4" }), "ro.mp4");
  const res = await fetch(`${TG_API}/sendVideo`, { method: "POST", body: form });
  const j = await res.json().catch(() => ({}));
  return !!j?.ok;
}

async function handleMessage(msg: any) {
  const chat_id = msg.chat.id;
  const user_id = msg.from?.id ?? chat_id;
  const text: string = (msg.text || msg.caption || "").trim();
  if (!text) return;

  const user = await getUser(chat_id, msg.from);

  // subscription gate — cached for 10 minutes to keep replies fast
  const lastCheck = user?.sub_checked_at ? new Date(user.sub_checked_at).getTime() : 0;
  const cacheFresh = user?.subscribed && Date.now() - lastCheck < 10 * 60_000;
  if (!cacheFresh) {
    const sub = await isSubscribed(user_id);
    if (!sub.ok) {
      if (user?.subscribed) await updateUser(chat_id, { subscribed: false });
      await askSubscribe(chat_id, sub.missing);
      return;
    }
    await updateUser(chat_id, { subscribed: true, sub_checked_at: new Date().toISOString() });
  }

  if (text === "/start") {
    await tg("sendMessage", {
      chat_id,
      text: `مرحباً! 👋 أنا Ro صديقك الذكي من RyoOne 💛\nمجاني 100% ✨ اكتب لي أي شي وراح أرد عليك.\nلصورة: /image ثم الوصف، أو اضغط زر «🖼 إنشاء صورة».\nلفيديو: /video ثم الوصف (فيديو واحد يومياً).\n⏱ صورة واحدة كل دقيقة، وبعد كل رسالتين انتظار 25 ثانية.\n\n— — —\n\nWelcome! 👋 I'm Ro, your smart friend from RyoOne 💛\n100% free ✨ Write me anything and I'll reply.\nFor an image: /image then the description, or tap "🖼 Create image".\nFor a video: /video then the description (one per day).\n⏱ One image per minute, and a 25s wait after every 2 messages.`,
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  const now = Date.now();

  // ===== control panel buttons =====
  if (text.startsWith("🖼")) {
    await tg("sendMessage", {
      chat_id,
      text: "اكتب الأمر مع وصف الصورة 👇\nWrite the command with your description 👇\n\n/image ",
      reply_markup: { force_reply: true, input_field_placeholder: "/image قطة تلعب في الحديقة" },
    });
    return;
  }
  if (text.startsWith("ℹ️")) {
    await tg("sendMessage", {
      chat_id,
      text: "🖼 إنشاء صورة: /image وصف الصورة\n🎬 إنشاء فيديو: /video وصف الفيديو (فيديو واحد يومياً)\n💬 دردشة: اكتب أي رسالة\n\n🖼 Create image: /image your description\n🎬 Create video: /video your description (one per day)\n💬 Chat: just send any message",
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }
  if (text.startsWith("🎬")) {
    await tg("sendMessage", {
      chat_id,
      text: "اكتب الأمر مع وصف الفيديو 👇 (فيديو واحد يومياً)\nWrite the command with your video description 👇 (one per day)\n\n/video ",
      reply_markup: { force_reply: true, input_field_placeholder: "/video قطة تركض في الحديقة" },
    });
    return;
  }
  if (text.startsWith("💬")) {
    await tg("sendMessage", { chat_id, text: "تفضل، اكتب لي 💛\nGo ahead, write to me 💛", reply_markup: MAIN_KEYBOARD });
    return;
  }

  // natural-language image request (no slash needed)
  const naturalImage = /(ارسم|إرسم|صمم|ولّد|ولد|اعمل|سوي|اصنع|ابغى|بدي)\s*(لي)?\s*(صورة|صوره|رسمة|رسمه)|^(صورة|صوره)\s+\S/i.test(text);

  // ===== video request =====
  if (/^\/(video|فيديو)/i.test(text)) {
    const prompt = text.replace(/^\/(video|فيديو)\s*/i, "").trim();
    if (!prompt) {
      await tg("sendMessage", { chat_id, text: "اكتب وصف الفيديو بعد الأمر:\n`/video قطة تركض في الحديقة`", parse_mode: "Markdown" });
      return;
    }
    const lastVid = user?.last_video_at ? new Date(user.last_video_at).getTime() : 0;
    if (now - lastVid < 24 * 60 * 60_000) {
      const hrs = Math.ceil((24 * 60 * 60_000 - (now - lastVid)) / 3_600_000);
      await tg("sendMessage", { chat_id, text: `🎬 فيديو واحد يومياً فقط. جرّب بعد ${hrs} ساعة 💛\nOnly one video per day. Try again in ${hrs}h.` });
      return;
    }
    if (await videoBusy()) {
      await tg("sendMessage", { chat_id, text: "⏳ هناك ضغط حالياً، شخص آخر يُنشئ فيديو الآن — انتظر دقيقة وجرّب مرة ثانية 💛\nHigh load right now, please wait a minute and try again." });
      return;
    }
    await updateUser(chat_id, { video_job_active: true });
    await tg("sendMessage", { chat_id, text: "🎬 جاري إنشاء الفيديو... خذ راحتك، يستغرق دقيقة إلى ثلاث دقائق ⏳" });
    try {
      await tg("sendChatAction", { chat_id, action: "upload_video" });
      const bytes = await generateVideo(prompt);
      if (!bytes || !(await sendVideoFile(chat_id, bytes, "🎬 تفضل! / Here you go!"))) {
        await tg("sendMessage", { chat_id, text: "😔 ما قدرت أنشئ الفيديو الحين، جرّب وصف ثاني بعد شوي." });
        await updateUser(chat_id, { video_job_active: false });
        return;
      }
      await updateUser(chat_id, {
        video_job_active: false,
        last_video_at: new Date().toISOString(),
        videos_used: (user?.videos_used || 0) + 1,
      });
    } catch (e) {
      console.error("video err", String(e));
      await updateUser(chat_id, { video_job_active: false });
      await tg("sendMessage", { chat_id, text: "😔 صار خطأ بإنشاء الفيديو، جرّب بعد شوي." });
    }
    return;
  }

  // ===== image request =====
  if (/^\/(image|img|صورة)/i.test(text) || naturalImage) {
    const prompt = text
      .replace(/^\/(image|img|صورة)\s*/i, "")
      .replace(/^(ارسم|إرسم|صمم|ولّد|ولد|اعمل|سوي|اصنع|ابغى|بدي)\s*(لي)?\s*(صورة|صوره|رسمة|رسمه)\s*(ل|عن|لـ)?\s*/i, "")
      .replace(/^(صورة|صوره)\s+/i, "")
      .trim();
    if (!prompt) {
      await tg("sendMessage", { chat_id, text: "اكتب وصف الصورة بعد الأمر:\n`/image قطة تلعب في الحديقة`", parse_mode: "Markdown" });
      return;
    }
    const lastImg = user?.last_image_at ? new Date(user.last_image_at).getTime() : 0;
    const elapsed = Math.floor((now - lastImg) / 1000);
    // start generating immediately, run the countdown in parallel
    const imgPromise = generateImage(prompt);
    if (elapsed < 60) {
      await countdown(chat_id, 60 - elapsed, "🖼 صورة واحدة كل دقيقة، انتظر قليلاً:");
    }
    await tg("sendChatAction", { chat_id, action: "upload_photo" });
    const url = await imgPromise;
    if (!url) {
      await tg("sendMessage", { chat_id, text: "😔 ما قدرت أولّد الصورة الحين، جرّب وصف ثاني بعد شوي." });
      return;
    }
    const sent = await sendGeneratedPhoto(chat_id, url, "✨ تفضل! / Here you go!");
    if (!sent) {
      await tg("sendMessage", { chat_id, text: "😔 ما قدرت أرسل الصورة، جرّب مرة ثانية." });
      return;
    }
    await updateUser(chat_id, {
      last_image_at: new Date().toISOString(),
      images_used: (user?.images_used || 0) + 1,
    });
    return;
  }

  // ===== text rate limit: after every 2 messages within a minute -> 25s wait =====
  const wStart = user?.window_start ? new Date(user.window_start).getTime() : 0;
  let count = user?.window_count || 0;
  if (!wStart || now - wStart > 60_000) { count = 0; }

  const history = Array.isArray(user?.history) ? user.history : [];
  history.push({ role: "user", content: text });

  // fire the AI request first so the wait runs in parallel with it
  await tg("sendChatAction", { chat_id, action: "typing" });
  const aiPromise = chatAI(history).catch((err: any) => {
    console.error("AI err:", String(err?.message || err));
    return null;
  });

  if (count >= 2) {
    await countdown(chat_id, 25, "⏱ وصلت للحد المؤقت (رسالتين)، الرد بعد:");
    count = 0;
  }

  const reply = await aiPromise;
  if (!reply) {
    await tg("sendMessage", { chat_id, text: "😔 صار خطأ بالذكاء الاصطناعي، جرب مرة ثانية بعد شوي." });
    return;
  }
  history.push({ role: "assistant", content: reply });
  await tg("sendMessage", { chat_id, text: reply });
  await supa().from("telegram_users").update({
    history: history.slice(-20),
    messages_used: (user?.messages_used || 0) + 1,
    window_start: count === 0 ? new Date().toISOString() : user?.window_start,
    window_count: count + 1,
    updated_at: new Date().toISOString(),
  }).eq("chat_id", chat_id);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("setup") === "1") {
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-webhook`;
    const r = await tg("setWebhook", { url: webhookUrl, allowed_updates: ["message", "callback_query"] });
    return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
  }
  if (req.method !== "POST") return new Response("ok");
  try {
    const update = await req.json();

    if (update.callback_query) {
      const cq = update.callback_query;
      const chat_id = cq.message?.chat?.id;
      const user_id = cq.from?.id;
      if (cq.data === "check_sub" && chat_id && user_id) {
        const sub = await isSubscribed(user_id);
        await tg("answerCallbackQuery", {
          callback_query_id: cq.id,
          text: sub.ok ? "تم التحقق ✅" : "لسا ما اشتركت بالقناتين ❌",
          show_alert: !sub.ok,
        });
        await getUser(chat_id, cq.from);
        await updateUser(chat_id, { subscribed: sub.ok });
        if (sub.ok) {
          await tg("sendMessage", { chat_id, text: "تم التحقق من اشتراكك ✅ أهلاً فيك، اكتب لي أي شي 💛" });
        }
      }
      return new Response(JSON.stringify({ ok: true }));
    }

    const msg = update.message;
    if (!msg?.chat?.id) return new Response(JSON.stringify({ ok: true }));
    // Ack Telegram instantly, keep working in the background (avoids retries + feels faster)
    const work = handleMessage(msg).catch((e) => console.error("handle err:", e));
    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else await work;
    return new Response(JSON.stringify({ ok: true }));
  } catch (e) {
    console.error("webhook err:", e);
    return new Response(JSON.stringify({ ok: true }));
  }
});
