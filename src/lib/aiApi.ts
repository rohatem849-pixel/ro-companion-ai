export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Using multiple free API providers with fallback
const PROVIDERS = [
  {
    name: "openrouter-free",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "meta-llama/llama-3.1-8b-instruct:free",
    headers: { "Content-Type": "application/json" },
  },
  {
    name: "openrouter-free-2", 
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "google/gemma-2-9b-it:free",
    headers: { "Content-Type": "application/json" },
  },
];

export async function streamChat(
  messages: ChatMessage[],
  mode: "lite" | "ryo",
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  signal?: AbortSignal
) {
  for (const provider of PROVIDERS) {
    try {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: provider.headers,
        body: JSON.stringify({
          model: provider.model,
          messages,
          stream: true,
          max_tokens: mode === "lite" ? 250 : 1500,
          temperature: mode === "lite" ? 0.7 : 0.5,
        }),
        signal,
      });

      if (!response.ok) {
        console.warn(`Provider ${provider.name} failed:`, response.status);
        continue; // try next provider
      }

      const reader = response.body?.getReader();
      if (!reader) continue;

      const decoder = new TextDecoder();
      let buffer = "";
      let gotContent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === ": OPENROUTER PROCESSING") continue;
          if (trimmed === "data: [DONE]") {
            onDone();
            return;
          }
          if (trimmed.startsWith("data: ")) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const token = json.choices?.[0]?.delta?.content;
              if (token) {
                gotContent = true;
                onToken(token);
              }
            } catch {}
          }
        }
      }
      
      if (gotContent) {
        onDone();
        return;
      }
      // If no content, try next provider
      continue;
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.warn(`Provider ${provider.name} error:`, err);
      continue;
    }
  }

  // All providers failed - use fallback local response
  const fallbackResponse = getFallbackResponse(messages);
  for (const char of fallbackResponse) {
    onToken(char);
    await new Promise(r => setTimeout(r, 15));
  }
  onDone();
}

function getFallbackResponse(messages: ChatMessage[]): string {
  const lastUser = messages.filter(m => m.role === "user").pop()?.content || "";
  
  if (lastUser.includes("اسم") || lastUser.includes("من أنت") || lastUser.includes("مين أنت")) {
    return "أنا Ro، صديقك الذكي من شركة RyoOne! ✨ أنا هنا عشان أساعدك وأكون رفيقك في كل شي 💜";
  }
  if (lastUser.includes("أيمن") || lastUser.includes("المبخر") || lastUser.includes("RyoOne")) {
    return "أيمن المبخر هو مؤسس ومدير شركة RyoOne 🚀 شاب سوري شغوف بالذكاء الاصطناعي وصناعة المحتوى. أنا فخور إني من صنعه! ✨";
  }
  
  return "عذراً، الاتصال بالخادم ضعيف حالياً 😔 جرب مرة ثانية بعد شوي! 💜";
}
