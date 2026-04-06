import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Square, Moon, Sun, ListTodo, Globe, Mic, X, Search, Trash2, Plus, Camera, Image as ImageIcon, Check, Menu, Bookmark } from "lucide-react";
import ChatMessage from "./ChatMessage";
import TasksPanel from "./TasksPanel";
import SettingsPanel from "./SettingsPanel";
import NewsNotificationsPanel from "./NewsNotificationsPanel";
import AppSidebar from "./AppSidebar";
import TheBrick from "./TheBrick";
import { UserProfile, Task, getTasks, saveTasks, buildSystemPrompt } from "@/lib/userProfile";
import { streamChat, ChatMessage as AIChatMessage, checkAdminPassword, saveAdminNote } from "@/lib/aiApi";
import { searchWeb, needsWebSearch, SearchResult } from "@/lib/webSearch";
import { supabase } from "@/integrations/supabase/client";
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

export default function ChatApp({ profile, onProfileUpdate }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState<"lite" | "ryo">("ryo");
  const [isDark, setIsDark] = useState(false);
  const [ryoLight, setRyoLight] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGlobePanel, setShowGlobePanel] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(getTasks());
  const [isRecording, setIsRecording] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
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
  const [showSidebar, setShowSidebar] = useState(false);
  const [showBrick, setShowBrick] = useState(false);
  const [brickContent, setBrickContent] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [directContacts, setDirectContacts] = useState<any[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [directChatTarget, setDirectChatTarget] = useState<any>(null);
  const [directMessages, setDirectMessages] = useState<Array<{id: string; content: string; sender_id: string; created_at: string}>>([]);
  const [directInput, setDirectInput] = useState("");

  // Swipe detection for The Brick
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Admin verification from importantNotes
  useEffect(() => {
    let cancelled = false;
    const notes = profile.importantNotes?.trim();
    if (!notes) {
      setIsAdmin(false);
      setAdminPassword("");
      return;
    }
    const verify = async () => {
      const result = await checkAdminPassword(notes);
      if (cancelled) return;
      if (result) {
        setIsAdmin(true);
        setAdminPassword(notes);
      } else {
        setIsAdmin(false);
        setAdminPassword("");
      }
    };
    verify();
    return () => { cancelled = true; };
  }, [profile.importantNotes]);

  // Load direct contacts + last messages
  useEffect(() => {
    if (!profile.userId) return;
    const loadContacts = async () => {
      const { data } = await supabase
        .from("message_requests")
        .select("*")
        .or(`sender_id.eq.${profile.userId},receiver_id.eq.${profile.userId}`)
        .eq("status", "accepted");
      if (!data || data.length === 0) { setDirectContacts([]); return; }

      const contactIds = data.map(r => r.sender_id === profile.userId ? r.receiver_id : r.sender_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", contactIds);

      // Get last message & unread count for each contact
      const contacts = await Promise.all((profiles || []).map(async (p) => {
        const { data: lastMsg } = await supabase.from("direct_messages")
          .select("content, created_at")
          .or(`and(sender_id.eq.${profile.userId},receiver_id.eq.${p.id}),and(sender_id.eq.${p.id},receiver_id.eq.${profile.userId})`)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        const { count } = await supabase.from("direct_messages")
          .select("id", { count: "exact", head: true })
          .eq("sender_id", p.id).eq("receiver_id", profile.userId).eq("is_read", false);
        return { ...p, lastMessage: lastMsg?.content || "", unread: count || 0 };
      }));
      setDirectContacts(contacts);
    };
    loadContacts();
    // Poll every 10s for new messages
    const interval = setInterval(loadContacts, 10000);
    return () => clearInterval(interval);
  }, [profile.userId]);

  // Session restoration - save/load active conversation
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ro_active_session");
      if (saved) {
        const session = JSON.parse(saved);
        if (session.messages?.length > 0) {
          setMessages(session.messages);
          setMode(session.mode || "ryo");
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem("ro_active_session", JSON.stringify({ messages, mode }));
    }
  }, [messages, mode]);

  // Swipe gesture
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (deltaX > 120 && deltaY < 80) {
      setShowBrick(true);
    }
  };

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
    setMode(newMode);
    setShowModelSelector(false);
  };

  const handleClearChat = () => {
    if (messages.length > 0 && !isSaved) {
      setShowClearConfirm(true);
    } else {
      clearChat();
    }
  };

  const clearChat = () => {
    setMessages([]);
    if (abortRef.current) abortRef.current.abort();
    setIsStreaming(false);
    setStoppedResponse(false);
    setIsSaved(false);
    setShowClearConfirm(false);
    localStorage.removeItem("ro_active_session");
  };

  const saveAndClear = async () => {
    await saveConversation();
    clearChat();
  };

  const stopStreaming = () => {
    if (abortRef.current) abortRef.current.abort();
    setIsStreaming(false);
    setStoppedResponse(true);
  };

  // Save conversation
  const saveConversation = async () => {
    if (!profile.userId || messages.length === 0) return;
    const title = messages.find(m => m.role === "user")?.content?.slice(0, 50) || "محادثة";
    try {
      await supabase.from("conversations").insert({
        user_id: profile.userId,
        title,
        mode,
        messages: messages as any,
      });
      setIsSaved(true);
    } catch (e) {
      console.error("Save error:", e);
    }
  };

  const loadConversation = (msgs: any[], convMode: string) => {
    setMessages(msgs);
    setMode(convMode as "lite" | "ryo");
    setIsSaved(true);
  };

  // Voice recording - speech to text in input field
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
      setInput(transcript);
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
    if (finalText) setInput(finalText);
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

    // Check for @_ messaging pattern
    if (userText && userText.startsWith("@_")) {
      const username = userText.split(" ")[0].slice(2);
      if (username) {
        await handleMessageRequest(username);
        setInput("");
        return;
      }
    }

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
    setIsSaved(false);

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

    const displayName = isAdmin ? "سيدي" : profile.name;

    const aiMessages: AIChatMessage[] = [
      { role: "system", content: buildSystemPrompt({ ...profile, name: displayName || profile.name }, tasks, mode, isAdmin) + searchContext },
      ...updatedMessages.map((m, index) => {
        const isLastUserMessage = index === updatedMessages.length - 1 && m.role === "user";
        if (isLastUserMessage && currentImageBase64) {
          return {
            role: "user" as const,
            content: [
              { type: "text" as const, text: m.content || "حلل هذه الصورة ورد عليها بشكل طبيعي." },
              { type: "image_url" as const, image_url: { url: currentImageBase64 } },
            ],
          };
        }
        return { role: m.role as "user" | "assistant", content: m.content };
      }),
    ];

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
  }, [input, messages, profile, tasks, mode, searchMode, isAdmin, adminPassword, imagePreview, imageBase64]);

  // Handle @_username messaging
  const handleMessageRequest = async (username: string) => {
    const { data: targetUser } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("username", username)
      .maybeSingle();

    if (!targetUser) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: `المستخدم @${username} غير موجود 😔`,
      }]);
      return;
    }

    // Check blocks
    const { data: blocked } = await supabase
      .from("blocks")
      .select("id")
      .or(`and(blocker_id.eq.${targetUser.id},blocked_id.eq.${profile.userId}),and(blocker_id.eq.${profile.userId},blocked_id.eq.${targetUser.id})`)
      .maybeSingle();

    if (blocked) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: "لا يمكن إرسال رسالة لهذا المستخدم 🚫",
      }]);
      return;
    }

    // Check existing request
    const { data: existing } = await supabase
      .from("message_requests")
      .select("id, status")
      .or(`and(sender_id.eq.${profile.userId},receiver_id.eq.${targetUser.id}),and(sender_id.eq.${targetUser.id},receiver_id.eq.${profile.userId})`)
      .maybeSingle();

    if (existing) {
      if (existing.status === "accepted") {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: "assistant",
          content: `أنت وَ @${username} متصلان بالفعل! ✅ يمكنكم التراسل من القائمة الجانبية.`,
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: "assistant",
          content: `طلب المراسلة مرسل بالفعل لـ @${username}. انتظر الموافقة ⏳`,
        }]);
      }
      return;
    }

    // Send new request
    await supabase.from("message_requests").insert({
      sender_id: profile.userId,
      receiver_id: targetUser.id,
    });

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: "assistant",
      content: `تم إرسال طلب مراسلة لـ @${username} ✅💚\nسيتم إعلامه وبمجرد الموافقة ستتمكنون من التراسل!`,
    }]);
  };

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

  const displayName = isAdmin ? "سيدي" : (profile.name || "");
  const isDarkMode = mode === "ryo" ? !ryoLight : isDark;

  return (
    <div
      className="flex flex-col h-[100dvh] w-full transition-colors duration-500 bg-background"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-2.5 border-b" dir="rtl">
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSidebar(true)} className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <Menu className="w-4 h-4" />
          </button>
          <img src={roLogo} alt="Ro" className="w-7 h-7 rounded-xl" />
          <span className="font-bold text-sm bg-clip-text text-transparent" style={{ backgroundImage: "var(--ro-gradient)" }}>
            Ro
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {messages.length > 0 && (
            <button
              onClick={saveConversation}
              className={`p-1.5 rounded-xl transition-all ${isSaved ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
              title="حفظ المحادثة"
            >
              <Bookmark className={`w-3.5 h-3.5 ${isSaved ? "fill-current" : ""}`} />
            </button>
          )}
          {messages.length > 0 && (
            <button onClick={handleClearChat} className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all" title="مسح المحادثة">
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
                    أنا{" "}
                    <span className="font-bold bg-clip-text text-transparent" style={{ backgroundImage: "var(--ro-gradient)" }}>Ro</span>
                    {" "}صديقك الذكي 🧠
                  </p>
                ) : (
                  <p className="text-lg font-medium text-muted-foreground">
                    <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--ro-gradient)" }}>Ro</span>
                    {" "}بس أسرع ⚡
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
              onPublishToBrick={msg.role === "assistant" && !isStreaming && msg.content ? () => {
                setBrickContent(msg.content);
                setShowBrick(true);
              } : undefined}
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
                <button onClick={stopRecording} className="ro-send-btn-circle flex-shrink-0" title="إيقاف وإضافة للنص">
                  <Square className="w-3.5 h-3.5" fill="currentColor" />
                </button>
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
                <button onClick={() => { if (recognitionRef.current) recognitionRef.current.stop(); setIsRecording(false); setRecordingText(""); setInput(""); }} className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-background transition-all flex-shrink-0">
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
                    placeholder="اسأل صديقك الذكي RO..."
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
                <p className="text-xs font-bold mb-2 bg-clip-text text-transparent" style={{ backgroundImage: "var(--ro-gradient)" }}>RO Ai</p>
                <button
                  onClick={() => switchMode("ryo")}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${mode === "ryo" ? "bg-secondary" : "hover:bg-secondary/50"}`}
                >
                  <div className="text-right">
                    <p className="text-sm font-semibold">Ryo Ai</p>
                    <p className="text-[11px] text-muted-foreground">يفكر بعمق</p>
                  </div>
                  {mode === "ryo" && <Check className="w-4 h-4 text-primary" />}
                </button>
                <button
                  onClick={() => switchMode("lite")}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${mode === "lite" ? "bg-secondary" : "hover:bg-secondary/50"}`}
                >
                  <div className="text-right">
                    <p className="text-sm font-semibold">Lite</p>
                    <p className="text-[11px] text-muted-foreground">يجيب بسرعة</p>
                  </div>
                  {mode === "lite" && <Check className="w-4 h-4 text-primary" />}
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

      {/* Clear confirm dialog */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[160] flex items-center justify-center p-4"
            style={{ background: "hsla(var(--background) / 0.7)", backdropFilter: "blur(4px)" }}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-card rounded-2xl border p-5 max-w-xs w-full shadow-2xl text-center space-y-4"
              dir="rtl"
            >
              <p className="text-sm font-bold">هل تريد حفظ المحادثة قبل المسح؟ 💬</p>
              <div className="flex flex-col gap-2">
                <button onClick={saveAndClear} className="w-full py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
                  حفظ ثم مسح
                </button>
                <button onClick={clearChat} className="w-full py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium">
                  مسح بدون حفظ
                </button>
                <button onClick={() => setShowClearConfirm(false)} className="w-full py-2 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium">
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings modal */}
      {showSettings && (
        <SettingsPanel
          profile={profile}
          onUpdate={onProfileUpdate}
          onClose={() => setShowSettings(false)}
          isAdmin={isAdmin}
        />
      )}

      {/* Sidebar */}
      <AppSidebar
        isOpen={showSidebar}
        onClose={() => setShowSidebar(false)}
        profile={profile}
        onLoadConversation={loadConversation}
        onOpenSettings={() => setShowSettings(true)}
        directContacts={directContacts}
        onOpenDirectChat={() => {}}
        onOpenBrick={() => { setShowSidebar(false); setShowBrick(true); }}
      />

      {/* The Brick */}
      <AnimatePresence>
        {showBrick && (
          <TheBrick
            isOpen={showBrick}
            onClose={() => { setShowBrick(false); setBrickContent(""); }}
            profile={profile}
            isAdmin={isAdmin}
            adminPassword={adminPassword}
            initialContent={brickContent}
          />
        )}
      </AnimatePresence>

      {/* Click outside to close popups */}
      {(showModelSelector || showAttachMenu) && (
        <div className="fixed inset-0 z-[-1]" onClick={() => { setShowModelSelector(false); setShowAttachMenu(false); }} />
      )}
    </div>
  );
}
