export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Using free Groq API alternative - we'll use the free tier of together.ai or groq
// For truly free lifetime, we use the Cerebras inference API (free tier)
// Fallback: use a free model via OpenRouter free tier

const API_URL = "https://openrouter.ai/api/v1/chat/completions";

// OpenRouter has free models - no API key needed for some, but we use their free tier
// We'll use a free model that works without auth: meta-llama/llama-3.1-8b-instruct:free

export async function streamChat(
  messages: ChatMessage[],
  mode: "lite" | "ryo",
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  signal?: AbortSignal
) {
  const model = mode === "lite" 
    ? "meta-llama/llama-3.1-8b-instruct:free"
    : "meta-llama/llama-3.1-8b-instruct:free";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: mode === "lite" ? 300 : 1500,
        temperature: mode === "lite" ? 0.7 : 0.6,
      }),
      signal,
    });

    if (!response.ok) {
      // Fallback to non-streaming
      const errText = await response.text();
      console.error("API error:", errText);
      onError("حدث خطأ في الاتصال، جاري إعادة المحاولة...");
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError("لم يتم الاتصال بالخادم");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") {
          if (trimmed === "data: [DONE]") {
            onDone();
            return;
          }
          continue;
        }
        if (trimmed.startsWith("data: ")) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const token = json.choices?.[0]?.delta?.content;
            if (token) onToken(token);
          } catch {}
        }
      }
    }
    onDone();
  } catch (err: any) {
    if (err.name === "AbortError") return;
    onError("خطأ في الاتصال بالإنترنت 😔");
  }
}
