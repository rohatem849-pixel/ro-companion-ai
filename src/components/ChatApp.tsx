import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Square, Moon, Sun, Settings, ListTodo, Globe, Mic, X, Search, Trash2, Plus, Camera, Image as ImageIcon, Check } from "lucide-react";
import ChatMessage from "./ChatMessage";
import TasksPanel from "./TasksPanel";
import SettingsPanel from "./SettingsPanel";
import NewsNotificationsPanel from "./NewsNotificationsPanel";
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
  imagePreview?: string;
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
  const [showGlobePanel, setShowGlobePanel] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(getTasks());
  const [isRecording, setIsRecording] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64Data] = useState<string | null>(null);
  const [stoppedResponse, setStoppedResponse] = useState(false);
  const [recordingText, setRecordingTextState] = useState("");
  const recordingTextRef = useRef("");
  const setRecordingText = (val: string) => { recordingTextRef.current = val; setRecordingTextState(val); };
  const [notificationCount, setNotificationCount] = useState(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Admin verification
  useEffect(() => {
    let cancelled = false;
    const candidates = buildAdminCandidates(profile.name || "");
    if (candidates.length === 0) {
      setIsAdmin(false); setAdminDisplayName(""); setAdminPassword("");
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
      setIsAdmin(false); setAdminDisplayName(""); setAdminPassword("");
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
    setShowModelSelector(false);
    if (abortRef.current) abortRef.current.abort();
  };

  const clearChat = () => {
    setMessages([]);
    if (abortRef.current) abortRef.current.abort();
    setIsStreaming(false);
    setStoppedResponse(false);
  };

  const stopStreaming = () => {
    if (abortRef.current) abortRef.current.abort();
    setIsStreaming(false);
    setStoppedResponse(true);
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
    recognition.onend = () => {};
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setRecordingText("");
  };

  const stopRecording = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsRecording(false);
    setRecordingText("");
  };

  const sendRecording = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsRecording(false);
    const finalText = recordingTextRef.current.trim();
    if (finalText) {
      setTimeout(() => sendMessage(finalText), 50);
    }
    setRecordingText("");
  };

  // Image handling
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setImagePreview(base64);
      setImageBase64Data(base64);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
    setShowAttachMenu(false);
  };

  const removeImagePreview = () => {
    setImagePreview(null);
    setImageBase64Data(null);
  };

  const sendMessage = useCallback(async (text?: string, regenerateIndex?: number, forceSearch?: boolean) => {
    const userText = text || input.trim();
    if (!userText && regenerateIndex === undefined && !imageBase64) return;

    let updatedMessages: Message[];
    const currentImagePreview = imagePreview;
    const currentImageBase64 = imageBase64;

    if (regenerateIndex !== undefined) {
      updatedMessages = messages.slice(0, regenerateIndex);
    } else {
      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: userText || "ما رأيك بهذه الصورة؟",
        imagePreview: currentImagePreview || undefined,
      };
      updatedMessages = [...messages, userMsg];
      setInput("");
      setImagePreview(null);
      setImageBase64Data(null);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }

    setMessages(updatedMessages);
    setIsStreaming(true);
    setStoppedResponse(false);

    // Admin note saving
    if (isAdmin && adminPassword && userText) {
      const savePatterns = [/احفظ|سجل|خلي ببالك|تذكر|حفظ في عقلك|حط بعقلك|خزن/];
      if (savePatterns.some(p => p.test(userText))) {
        const noteContent = userText.replace(/احفظ|سجل|خلي ببالك|تذكر|حفظ في عقلك|حط بعقلك|خزن/g, "").trim();
        if (noteContent.length > 3) {
          try {
            await saveAdminNote(adminPassword, noteContent);
          } catch (e) {
            console.error("Failed to save admin note:", e);
          }
        }
      }
    }

    const assistantId = (Date.now() + 1).toString();

    // Search
    const shouldSearch = forceSearch || searchMode || needsWebSearch(userText);
    let searchResults: SearchResult[] = [];

    if (shouldSearch) {
      setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", isSearching: true }]);
      try {
        searchResults = await searchWeb(userText);
      } catch {}
      setSearchMode(false);
    }

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

    // Image context
    if (currentImageBase64 && aiMessages.length > 0) {
      const lastMsg = aiMessages[aiMessages.length - 1];
      if (lastMsg.role === "user") {
        lastMsg.content = `[المستخدم أرسل صورة مرفقة] ${lastMsg.content}\n(الصورة مرفقة وتحتاج تحليلها أو ردة فعل عليها)`;
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
  }, [input, messages, profile, tasks, mode, searchMode, isAdmin, adminPassword, adminDisplayName, imagePreview, imageBase64]);

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
  const isDarkMode = mode === "ryo" ? !ryoLight : isDark;

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
          {messages.length > 0 && (
            <button onClick={clearChat} className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all" title="مسح المحادثة">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={toggleDark} className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setShowTasks(!showTasks)} className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <ListTodo className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowGlobePanel(!showGlobePanel)}
            className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all relative"
          >
            <Globe className="w-3.5 h-3.5" />
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -left-0.5 w-3.5 h-3.5 rounded-full bg-destructive text-[8px] text-destructive-foreground flex items-center justify-center font-bold">
                {notificationCount}
              </span>
            )}
          </button>
          <button onClick={() => setShowSettings(true)} className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Tasks slide-down */}
      <AnimatePresence>
        {showTasks && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-b overflow-hidden bg-card">
            <TasksPanel tasks={tasks} onUpdate={(t) => { setTasks(t); saveTasks(t); }} onClose={() => setShowTasks(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Globe Panel */}
      <AnimatePresence>
        {showGlobePanel && (
          <NewsNotificationsPanel
            profile={profile}
            tasks={tasks}
            onClose={() => setShowGlobePanel(false)}
            onAskRo={(question) => {
              setShowGlobePanel(false);
              setInput(question);
              setTimeout(() => sendMessage(question), 100);
            }}
            onNotificationCountChange={setNotificationCount}
          />
        )}
      </AnimatePresence>

      {/* Chat area */}
      <main className="flex-1 overflow-y-auto px-3 py-3 md:px-6" dir="rtl">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full flex items-center justify-center min-h-[60vh]">
              <div className="text-center px-4">
                <img src={roLogo} alt="Ro" className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-lg" />
                <h2 className="text-3xl md:text-4xl font-bold mb-2 tracking-tight">
                  {displayName ? `أهلاً ${displayName}` : "أهلاً"}
                </h2>
                {mode === "ryo" ? (
                  <p className="text-base mt-2">
                    <span className="font-bold bg-clip-text text-transparent" style={{ backgroundImage: "var(--ro-gradient)" }}>Ro</span>
                    {" "}
                    <span className="text-muted-foreground">ولكن أفكر بعمق</span>
                    {" "}🧠😎
                  </p>
                ) : (
                  <p className="text-lg font-medium text-muted-foreground">
                    أنا{" "}
                    <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--ro-gradient)" }}>Ro</span>
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
              imagePreview={msg.imagePreview}
            />
          ))}
          {stoppedResponse && (
            <p className="text-[11px] text-muted-foreground text-center mt-1 mb-2">⏹ تم إيقاف الرد</p>
          )}
          <div ref={chatEndRef} />
        </div>
      </main>

      {/* Input area */}
      <div className="px-3 pb-3 pt-1.5" dir="rtl">
        <div className="max-w-3xl mx-auto">
          {/* Image preview */}
          <AnimatePresence>
            {imagePreview && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mb-2 relative inline-block"
              >
                <img src={imagePreview} alt="preview" className="w-20 h-20 object-cover rounded-xl border" />
                <button
                  onClick={removeImagePreview}
                  className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {isRecording ? (
              <motion.div
                key="recorder"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center gap-3 bg-secondary rounded-2xl border px-3 py-3"
              >
                {/* Send recording */}
                <button onClick={sendRecording} className="ro-send-btn-circle flex-shrink-0">
                  <ArrowUp className="w-4 h-4" />
                </button>
                {/* Waveform */}
                <div className="flex-1 flex items-center gap-0.5 justify-center">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-[3px] rounded-full bg-foreground/40"
                      style={{
                        height: `${8 + Math.random() * 16}px`,
                        animation: `waveform 0.8s ease-in-out ${i * 0.05}s infinite alternate`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                  {recordingText || "تكلم الآن..."}
                </span>
                {/* Cancel */}
                <button onClick={stopRecording} className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-background transition-all flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="input"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-secondary rounded-2xl border transition-all focus-within:border-primary"
              >
                {/* Textarea */}
                <div className="px-3 pt-2.5 pb-1">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    placeholder="اسأل صديقك الذكي"
                    rows={1}
                    disabled={isStreaming}
                    className="w-full bg-transparent outline-none text-sm resize-none text-foreground placeholder:text-muted-foreground/60 leading-relaxed max-h-[120px] placeholder:text-[13px]"
                  />
                </div>
                {/* Button row */}
                <div className="flex items-center justify-between px-2 pb-2">
                  <div className="flex items-center gap-1">
                    {/* Send / Stop */}
                    {isStreaming ? (
                      <button onClick={stopStreaming} className="ro-send-btn-circle flex-shrink-0" title="إيقاف">
                        <Square className="w-3.5 h-3.5" fill="currentColor" />
                      </button>
                    ) : (
                      <button
                        onClick={() => sendMessage()}
                        disabled={!input.trim() && !imagePreview}
                        className="ro-send-btn-circle disabled:opacity-30 flex-shrink-0"
                        title="إرسال"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                    )}
                    {/* Mic */}
                    <button
                      onClick={startRecording}
                      disabled={isStreaming}
                      className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-background transition-all flex-shrink-0"
                      title="تسجيل صوتي"
                    >
                      <Mic className="w-[18px] h-[18px]" />
                    </button>
                    {/* Model selector chip */}
                    <button
                      onClick={() => setShowModelSelector(!showModelSelector)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[12px] font-medium bg-background border hover:bg-muted transition-all"
                    >
                      {mode === "lite" ? "Lite" : "Ryo Ai"}
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Search */}
                    <button
                      onClick={() => {
                        if (searchMode && input.trim()) {
                          sendMessage(input.trim(), undefined, true);
                        } else {
                          setSearchMode(!searchMode);
                        }
                      }}
                      className={`p-2 rounded-full transition-all flex-shrink-0 ${
                        searchMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-background"
                      }`}
                      title="بحث"
                    >
                      <Search className="w-[18px] h-[18px]" />
                    </button>
                    {/* Plus / Attach */}
                    <button
                      onClick={() => setShowAttachMenu(!showAttachMenu)}
                      className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-background transition-all flex-shrink-0"
                      title="إرفاق"
                    >
                      <Plus className="w-[18px] h-[18px]" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Model selector popup */}
          <AnimatePresence>
            {showModelSelector && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mt-2 bg-card rounded-2xl border shadow-xl p-4 space-y-1"
              >
                <p className="text-xs font-bold text-muted-foreground mb-2 bg-clip-text text-transparent" style={{ backgroundImage: "var(--ro-gradient)" }}>RO Ai</p>
                <button
                  onClick={() => switchMode("lite")}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${mode === "lite" ? "bg-secondary" : "hover:bg-secondary/50"}`}
                >
                  <div className="text-right">
                    <p className="text-sm font-semibold">Lite</p>
                    <p className="text-[11px] text-muted-foreground">يجيب بسرعة</p>
                  </div>
                  {mode === "lite" && <Check className="w-4 h-4 text-blue-500" />}
                </button>
                <button
                  onClick={() => switchMode("ryo")}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${mode === "ryo" ? "bg-secondary" : "hover:bg-secondary/50"}`}
                >
                  <div className="text-right">
                    <p className="text-sm font-semibold">Ryo Ai</p>
                    <p className="text-[11px] text-muted-foreground">يفكر بعمق</p>
                  </div>
                  {mode === "ryo" && <Check className="w-4 h-4 text-blue-500" />}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Attachment menu popup */}
          <AnimatePresence>
            {showAttachMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mt-2 bg-card rounded-2xl border shadow-xl p-3 space-y-1"
              >
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageSelect} />
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-all text-right"
                >
                  <Camera className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm">الكاميرا</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-all text-right"
                >
                  <ImageIcon className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm">معرض الصور</span>
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

      {/* Click outside to close popups */}
      {(showModelSelector || showAttachMenu) && (
        <div className="fixed inset-0 z-[-1]" onClick={() => { setShowModelSelector(false); setShowAttachMenu(false); }} />
      )}
    </div>
  );
}
