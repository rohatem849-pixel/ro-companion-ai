export interface ChatMessagePart {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatMessagePart[];
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export async function streamChat(
  messages: ChatMessage[],
  mode: "lite" | "ryo",
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  signal?: AbortSignal
) {
  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages, mode }),
      signal,
    });

    if (!resp.ok) {
      let errMsg = "عذراً، حدث خطأ في الاتصال 😔 جرب مرة ثانية!";
      try {
        const errData = await resp.json();
        if (errData.error) errMsg = errData.error;
      } catch {}
      onError(errMsg);
      return;
    }

    if (!resp.body) {
      onError("عذراً، لا يمكن الاتصال بالخادم حالياً 😔");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let gotContent = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            gotContent = true;
            onToken(content);
          }
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }

    // Final flush
    if (textBuffer.trim()) {
      for (let raw of textBuffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            gotContent = true;
            onToken(content);
          }
        } catch {}
      }
    }

    if (gotContent) {
      onDone();
    } else {
      onError("عذراً، لم أتمكن من الرد حالياً 😔 جرب مرة ثانية!");
    }
  } catch (err: any) {
    if (err.name === "AbortError") return;
    console.error("Stream error:", err);
    onError("عذراً، حدث خطأ في الاتصال 😔 جرب مرة ثانية!");
  }
}

// Check admin password via backend
export async function checkAdminPassword(password: string): Promise<boolean> {
  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ checkAdmin: password }),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.isAdmin === true;
  } catch {
    return false;
  }
}

// Save admin note to Ro's memory
export async function saveAdminNote(password: string, note: string): Promise<boolean> {
  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ saveNote: note, adminPassword: password }),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.success === true;
  } catch {
    return false;
  }
}
