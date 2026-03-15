import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Moon, Sun, Settings, ListTodo, Sparkles, Zap } from "lucide-react";
import ChatMessage from "./ChatMessage";
import TasksPanel from "./TasksPanel";
import SettingsPanel from "./SettingsPanel";
import { UserProfile, Task, getProfile, getTasks, saveTasks, buildSystemPrompt } from "@/lib/userProfile";
import { streamChat, ChatMessage as AIChatMessage } from "@/lib/aiApi";
import roLogo from "@/assets/ro-logo.png";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Props {
  profile: UserProfile;
  onProfileUpdate: (p: UserProfile) => void;
}

export default function ChatApp({ profile, onProfileUpdate }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState<"lite" | "ryo">("lite");
  const [isDark, setIsDark] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(getTasks());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "ryo") {
      root.classList.add("ryo-ai-mode");
      root.classList.add("dark");
    } else {
      root.classList.remove("ryo-ai-mode");
      if (!isDark) root.classList.remove("dark");
    }
  }, [mode, isDark]);

  const toggleDark = () => {
    if (mode === "ryo") return;
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  const switchMode = (newMode: "lite" | "ryo") => {
    if (newMode === mode) return;
    setMessages([]);
    setMode(newMode);
    if (abortRef.current) abortRef.current.abort();
  };

  const sendMessage = useCallback(async (text?: string, regenerateIndex?: number) => {
    const userText = text || input.trim();
    if (!userText && regenerateIndex === undefined) return;

    let updatedMessages: Message[];

    if (regenerateIndex !== undefined) {
      updatedMessages = messages.slice(0, regenerateIndex);
    } else {
      const userMsg: Message = { id: Date.now().toString(), role: "user", content: userText };
      updatedMessages = [...messages, userMsg];
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }

    setMessages(updatedMessages);
    setIsStreaming(true);

    const aiMessages: AIChatMessage[] = [
      { role: "system", content: buildSystemPrompt(profile, tasks, mode) },
      ...updatedMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    abortRef.current = new AbortController();

    await streamChat(
      aiMessages,
      mode,
      (token) => {
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: m.content + token } : m)
        );
      },
      () => setIsStreaming(false),
      (error) => {
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: error } : m)
        );
        setIsStreaming(false);
      },
      abortRef.current.signal
    );
  }, [input, messages, profile, tasks, mode]);

  const handleRegenerate = (index: number) => {
    sendMessage(undefined, index);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const userName = profile.name || "";

  return (
    <div className="flex flex-col h-screen w-full transition-colors duration-500 bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b" dir="rtl">
        <div className="flex items-center gap-2">
          <img src={roLogo} alt="Ro" className="w-8 h-8 rounded-xl" />
          <span className="font-bold text-sm bg-clip-text text-transparent" style={{ backgroundImage: "var(--ro-gradient)" }}>
            Ro
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Mode switcher */}
          <div className="flex bg-secondary rounded-xl p-0.5 gap-0.5">
            <button
              onClick={() => switchMode("lite")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                mode === "lite" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="w-3 h-3" /> Lite
            </button>
            <button
              onClick={() => switchMode("ryo")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                mode === "ryo" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="w-3 h-3" /> Ryo Ai
            </button>
          </div>

          <button onClick={toggleDark} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            {isDark || mode === "ryo" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button onClick={() => setShowTasks(!showTasks)} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <ListTodo className="w-4 h-4" />
          </button>
          <button onClick={() => setShowSettings(true)} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Tasks slide-down */}
      <AnimatePresence>
        {showTasks && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b overflow-hidden bg-card"
          >
            <TasksPanel tasks={tasks} onUpdate={setTasks} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat area */}
      <main className="flex-1 overflow-y-auto px-4 py-4 md:px-6" dir="rtl">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full flex items-center justify-center min-h-[60vh]"
            >
              <div className="text-center px-4">
                <h2 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight">
                  {userName ? `أهلاً ${userName}` : "أهلاً"} أنا{" "}
                  <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--ro-gradient)" }}>
                    Ro
                  </span>
                </h2>
                <p className="text-lg font-medium text-muted-foreground">
                  {mode === "lite" 
                    ? "صديقك الذكي من RyoOne ✨" 
                    : "نسختك المتقدمة من RyoOne 🧠"}
                </p>
              </div>
            </motion.div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"}
              onRegenerate={msg.role === "assistant" && !isStreaming ? () => handleRegenerate(i) : undefined}
            />
          ))}
          <div ref={chatEndRef} />
        </div>
      </main>

      {/* Input */}
      <div className="px-4 pb-4 pt-2" dir="rtl">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 bg-secondary rounded-2xl border px-3 py-2 transition-all focus-within:border-primary">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="اكتب رسالتك..."
              rows={1}
              disabled={isStreaming}
              className="flex-1 bg-transparent outline-none text-sm resize-none text-foreground placeholder:text-muted-foreground leading-relaxed max-h-[120px]"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isStreaming}
              className="p-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-all flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
        </div>
      </div>
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <SettingsPanel profile={profile} onUpdate={onProfileUpdate} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
