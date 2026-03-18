import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Moon, Sun, Settings, ListTodo, Sparkles, Zap, Mic, Square, Search, Trash2, Image as ImageIcon } from "lucide-react";
import ChatMessage from "./ChatMessage";
import TasksPanel from "./TasksPanel";
import SettingsPanel from "./SettingsPanel";
import { UserProfile, Task, getTasks, saveTasks, buildSystemPrompt } from "@/lib/userProfile";
import { streamChat, ChatMessage as AIChatMessage, checkAdminPassword, saveAdminNote } from "@/lib/aiApi";
import { searchWeb, needsWebSearch, SearchResult } from "@/lib/webSearch";
import roLogo from "@/assets/ro-logo.png";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  searchResults?: SearchResult[];
  isSearching?: boolean;
  hasImage?: boolean;
}

interface Props {
  profile: UserProfile;
  onProfileUpdate: (p: UserProfile) => void;
}

function buildAdminCandidates(rawName: string) {
  const trimmed = rawName.trim();
  if (!trimmed) return [] as Array<{ password: string; displayName: string }>;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const candidates = new Map<string, string>();
  candidates.set(trimmed, "");
  for (let i = 1; i < parts.length; i++) {
    const password = parts.slice(i).join(" ").trim();
    const displayName = parts.slice(0, i).join(" ").trim();
    if (password) candidates.set(password, displayName);
  }
  return Array.from(candidates, ([password, displayName]) => ({ password, displayName }));
}

export default function ChatApp({ profile, onProfileUpdate }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState<"lite" | "ryo">("lite");
  const [isDark, setIsDark] = useState(false);
  const [ryoLight, setRyoLight] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(getTasks());
  const [isRecording, setIsRecording] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recordingText, setRecordingText] = useState("");

  // Admin verification
  useEffect(() => {
    let cancelled = false;
    const candidates = buildAdminCandidates(profile.name || "");
    if (candidates.length === 0) {
      setIsAdmin(false);
      setAdminDisplayName("");
      setAdminPassword("");
      return;
    }
    const verifyAdmin = async () => {
      for (const candidate of candidates) {
        const result = await checkAdminPassword(candidate.password);
        if (cancelled) return;
        if (result) {
          setIsAdmin(true);
          setAdminDisplayName(candidate.displayName || "سيدي");
          setAdminPassword(candidate.password);
          return;
        }
      }
      setIsAdmin(false);
      setAdminDisplayName("");
      setAdminPassword("");
    };
    verifyAdmin();
    return () => { cancelled = true; };
  }, [profile.name]);

  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "ryo") {
      root.classList.remove("dark");
      root.classList.add("ryo-ai-mode");
      if (ryoLight) root.classList.add("ryo-light");
      else root.classList.remove("ryo-light");
    } else {
      root.classList.remove("ryo-ai-mode", "ryo-light");
      if (isDark) root.classList.add("dark");
      else root.classList.remove("dark");
    }
  }, [mode, isDark, ryoLight]);

  const toggleDark = () => {
    if (mode === "ryo") setRyoLight(!ryoLight);
    else setIsDark(!isDark);
  };

  const switchMode = (newMode: "lite" | "ryo") => {
    if (newMode === mode) return;
    setMessages([]);
    setMode(newMode);
    if (abortRef.current) abortRef.current.abort();
  };

  const clearChat = () => {
    setMessages([]);
    if (abortRef.current) abortRef.current.abort();
    setIsStreaming(false);
  };

  // Voice recording
  const startRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "ar-SA";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setRecordingText(transcript);
    };
    recognition.onerror = () => { setIsRecording(false); setRecordingText(""); };
    recognition.onend = () => { /* don't auto-stop, user controls it */ };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setRecordingText("");
  };

  const stopAndSendRecording = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsRecording(false);
    if (recordingText.trim()) {
      sendMessage(recordingText.trim());
    }
    setRecordingText("");
  };

  // Image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const text = input.trim() || "ما رأيك بهذه الصورة؟";
      sendMessage(text, undefined, false, base64);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const sendMessage = useCallback(async (text?: string, regenerateIndex?: number, forceSearch?: boolean, imageBase64?: string) => {
    const userText = text || input.trim();
    if (!userText && regenerateIndex === undefined) return;

    let updatedMessages: Message[];

    if (regenerateIndex !== undefined) {
      updatedMessages = messages.slice(0, regenerateIndex);
    } else {
      const userMsg: Message = { id: Date.now().toString(), role: "user", content: userText, hasImage: !!imageBase64 };
      updatedMessages = [...messages, userMsg];
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }

    setMessages(updatedMessages);
    setIsStreaming(true);

    // Check if admin wants to save a note
    if (isAdmin && adminPassword) {
      const savePatterns = [/احفظ|سجل|خلي ببالك|تذكر|حفظ في عقلك/];
      if (savePatterns.some(p => p.test(userText))) {
        const noteContent = userText.replace(/احفظ|سجل|خلي ببالك|تذكر|حفظ في عقلك/g, "").trim();
        if (noteContent.length > 5) {
          saveAdminNote(adminPassword, noteContent);
        }
      }
    }

    const assistantId = (Date.now() + 1).toString();

    // Check if search is needed
    const shouldSearch = forceSearch || searchMode || needsWebSearch(userText);
    let searchResults: SearchResult[] = [];

    if (shouldSearch) {
      setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", isSearching: true }]);
      try {
        searchResults = await searchWeb(userText);
      } catch {}
      setSearchMode(false);
    }

    // Build search context
    let searchContext = "";
    if (searchResults.length > 0) {
      searchContext = "\n\nنتائج البحث من الإنترنت (استخدمها للإجابة بدقة مع ذكر المصادر):\n" +
        searchResults.map((r, i) => `[${i + 1}] ${r.title} (${r.source}): ${r.snippet}`).join("\n");
    }

    const promptDisplayName = isAdmin ? adminDisplayName : profile.name;

    const aiMessages: AIChatMessage[] = [
      { role: "system", content: buildSystemPrompt({ ...profile, name: promptDisplayName }, tasks, mode, isAdmin) + searchContext },
      ...updatedMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    // If image is attached, add it to the last user message
    if (imageBase64 && aiMessages.length > 0) {
      const lastMsg = aiMessages[aiMessages.length - 1];
      if (lastMsg.role === "user") {
        lastMsg.content = `[المستخدم أرسل صورة] ${lastMsg.content}\n(وصف: صورة مرفقة من المستخدم يريد رأيك فيها أو تحليلها)`;
      }
    }

    setMessages(prev => {
      const existing = prev.find(m => m.id === assistantId);
      if (existing) {
        return prev.map(m => m.id === assistantId ? { ...m, content: "", isSearching: false, searchResults } : m);
      }
      return [...prev, { id: assistantId, role: "assistant" as const, content: "", searchResults }];
    });

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
  }, [input, messages, profile, tasks, mode, searchMode, isAdmin, adminPassword, adminDisplayName]);

  const handleRegenerate = (index: number) => sendMessage(undefined, index);

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

  const displayName = isAdmin ? (adminDisplayName || "سيدي") : (profile.name || "");

  return (
    <div className="flex flex-col h-[100dvh] w-full transition-colors duration-500 bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-2.5 border-b" dir="rtl">
        <div className="flex items-center gap-2">
          <img src={roLogo} alt="Ro" className="w-7 h-7 rounded-xl" />
          <span className="font-bold text-sm bg-clip-text text-transparent" style={{ backgroundImage: "var(--ro-gradient)" }}>
            Ro
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          {/* Mode switcher */}
          <div className="flex bg-secondary rounded-xl p-0.5 gap-0.5">
            <button
              onClick={() => switchMode("lite")}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                mode === "lite" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="w-3 h-3" /> Lite
            </button>
            <button
              onClick={() => switchMode("ryo")}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                mode === "ryo" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="w-3 h-3" /> Ryo
            </button>
          </div>

          {messages.length > 0 && (
            <button onClick={clearChat} className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all" title="مسح المحادثة">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={toggleDark} className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            {(mode === "ryo" ? !ryoLight : isDark) ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setShowTasks(!showTasks)} className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <ListTodo className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setShowSettings(true)} className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <Settings className="w-3.5 h-3.5" />
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
            <TasksPanel tasks={tasks} onUpdate={setTasks} onClose={() => setShowTasks(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat area */}
      <main className="flex-1 overflow-y-auto px-3 py-3 md:px-6" dir="rtl">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full flex items-center justify-center min-h-[60vh]"
            >
              <div className="text-center px-4">
                <img src={roLogo} alt="Ro" className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-lg" />
                <h2 className="text-3xl md:text-4xl font-bold mb-2 tracking-tight">
                  {displayName ? `أهلاً ${displayName}` : "أهلاً"} 
                </h2>
                {mode === "ryo" ? (
                  <p className="text-base font-semibold mt-2">
                    <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--ro-gradient)" }}>
                      Ro
                    </span>
                    {" "}ولكن أفكر بعمق 🧠😎
                  </p>
                ) : (
                  <p className="text-lg font-medium text-muted-foreground">
                    أنا{" "}
                    <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--ro-gradient)" }}>
                      Ro
                    </span>
                    {" "}صديقك الذكي ✨
                  </p>
                )}
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
              searchResults={msg.searchResults}
              isSearching={msg.isSearching}
              mode={mode}
              hasImage={msg.hasImage}
            />
          ))}
          <div ref={chatEndRef} />
        </div>
      </main>

      {/* Input */}
      <div className="px-3 pb-3 pt-1.5" dir="rtl">
        <div className="max-w-3xl mx-auto">
          <AnimatePresence mode="wait">
            {isRecording ? (
              <motion.div
                key="recorder"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center gap-2 bg-secondary rounded-2xl border border-destructive/30 px-3 py-3"
              >
                {/* Recording indicator */}
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                  <span className="text-sm text-foreground flex-1 truncate" dir="rtl">
                    {recordingText || "...تكلم الآن"}
                  </span>
                </div>
                {/* Send recording */}
                <button
                  onClick={stopAndSendRecording}
                  className="ro-send-btn p-2.5 rounded-xl transition-all flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="input"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-end gap-1.5 bg-secondary rounded-2xl border px-2.5 py-2 transition-all focus-within:border-primary"
              >
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
                
                {/* Image upload */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming}
                  className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-background transition-all flex-shrink-0"
                  title="إرسال صورة"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>

                {/* Search */}
                <button
                  onClick={() => {
                    if (searchMode && input.trim()) {
                      sendMessage(input.trim(), undefined, true);
                    } else {
                      setSearchMode(!searchMode);
                    }
                  }}
                  className={`p-1.5 rounded-xl transition-all flex-shrink-0 ${
                    searchMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-background"
                  }`}
                  title="بحث من الويب"
                >
                  <Search className="w-4 h-4" />
                </button>

                {/* Mic */}
                <button
                  onClick={startRecording}
                  disabled={isStreaming}
                  className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-background transition-all flex-shrink-0"
                  title="تسجيل صوتي"
                >
                  <Mic className="w-4 h-4" />
                </button>

                {/* Send */}
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || isStreaming}
                  className="ro-send-btn p-2 rounded-xl disabled:opacity-30 transition-all flex-shrink-0 active:scale-90"
                >
                  <Send className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <SettingsPanel profile={profile} onUpdate={onProfileUpdate} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
