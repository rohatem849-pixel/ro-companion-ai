import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowUp, Plus, Search, Users, Ban, Settings, Trash2, Mic, Square, Image as ImageIcon, Camera, Video, MessageCircle, ChevronRight, Link2, Bell, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UserProfile } from "@/lib/userProfile";
import roLogo from "@/assets/ro-logo.png";

interface Contact {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  lastMessage?: string;
  lastMessageTime?: string;
  unread: number;
}

interface DirectMessage {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  status: string;
  media_url?: string | null;
  media_type?: string | null;
  is_read: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  isAdmin: boolean;
}

type Tab = "contacts" | "requests" | "blocked" | "search" | "settings" | "chat" | "trash";

export default function MessagingHub({ isOpen, onClose, profile, isAdmin }: Props) {
  const [tab, setTab] = useState<Tab>("contacts");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [chatTarget, setChatTarget] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingText, setRecordingText] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showBlockConfirm, setShowBlockConfirm] = useState<string | null>(null);
  const [askRoActive, setAskRoActive] = useState(false);
  const [deletedConvos, setDeletedConvos] = useState<any[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [requestCount, setRequestCount] = useState(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordingTextRef = useRef("");

  useEffect(() => {
    if (isOpen && profile.userId) {
      loadContacts();
      loadPendingRequests();
      loadBlockedUsers();
    }
  }, [isOpen, profile.userId]);

  // Poll messages in active chat
  useEffect(() => {
    if (!chatTarget || !profile.userId) return;
    loadMessages(chatTarget.id);
    const poll = setInterval(() => loadMessages(chatTarget.id), 3000);
    return () => clearInterval(poll);
  }, [chatTarget, profile.userId]);

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadContacts = async () => {
    if (!profile.userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("message_requests")
      .select("*")
      .or(`sender_id.eq.${profile.userId},receiver_id.eq.${profile.userId}`)
      .eq("status", "accepted");
    if (!data || data.length === 0) { setContacts([]); setTotalUnread(0); setLoading(false); return; }

    const contactIds = data.map(r => r.sender_id === profile.userId ? r.receiver_id : r.sender_id);
    const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", contactIds);

    let total = 0;
    const contactList = await Promise.all((profiles || []).map(async (p) => {
      const { data: lastMsg } = await supabase.from("direct_messages")
        .select("content, created_at")
        .or(`and(sender_id.eq.${profile.userId},receiver_id.eq.${p.id}),and(sender_id.eq.${p.id},receiver_id.eq.${profile.userId})`)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { count } = await supabase.from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("sender_id", p.id).eq("receiver_id", profile.userId).eq("is_read", false);
      const unread = count || 0;
      total += unread;
      return { ...p, lastMessage: lastMsg?.content || "", lastMessageTime: lastMsg?.created_at, unread };
    }));
    contactList.sort((a, b) => {
      if (!a.lastMessageTime && !b.lastMessageTime) return 0;
      if (!a.lastMessageTime) return 1;
      if (!b.lastMessageTime) return -1;
      return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
    });
    setContacts(contactList);
    setTotalUnread(total);
    setLoading(false);
  };

  const loadPendingRequests = async () => {
    if (!profile.userId) return;
    const { data } = await supabase.from("message_requests").select("*").eq("receiver_id", profile.userId).eq("status", "pending");
    if (data && data.length > 0) {
      const senderIds = data.map(r => r.sender_id);
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", senderIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const requests = data.map(r => ({ ...r, senderProfile: profileMap.get(r.sender_id) }));
      setPendingRequests(requests);
      setRequestCount(requests.length);
    } else {
      setPendingRequests([]);
      setRequestCount(0);
    }
  };

  const loadBlockedUsers = async () => {
    if (!profile.userId) return;
    const { data } = await supabase.from("blocks").select("*").eq("blocker_id", profile.userId);
    if (data && data.length > 0) {
      const blockedIds = data.map(b => b.blocked_id);
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", blockedIds);
      setBlockedUsers((profiles || []).map(p => ({ ...p, blockId: data.find(b => b.blocked_id === p.id)?.id })));
    } else {
      setBlockedUsers([]);
    }
  };

  const loadMessages = async (contactId: string) => {
    if (!profile.userId) return;
    const { data } = await supabase.from("direct_messages")
      .select("id, content, sender_id, created_at, status, media_url, media_type, is_read")
      .or(`and(sender_id.eq.${profile.userId},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${profile.userId})`)
      .order("created_at", { ascending: true }).limit(200);
    if (data) {
      setMessages(data);
      // Mark as read
      await supabase.from("direct_messages").update({ is_read: true, status: "read" })
        .eq("sender_id", contactId).eq("receiver_id", profile.userId).eq("is_read", false);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;
    const { data } = await supabase.from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("visible_in_search", true)
      .ilike("username", `%${searchQuery.trim().toLowerCase()}%`)
      .neq("id", profile.userId)
      .limit(20);
    
    // Check existing requests/contacts
    if (data) {
      const enriched = await Promise.all(data.map(async (u) => {
        const { data: existing } = await supabase.from("message_requests")
          .select("id, status")
          .or(`and(sender_id.eq.${profile.userId},receiver_id.eq.${u.id}),and(sender_id.eq.${u.id},receiver_id.eq.${profile.userId})`)
          .maybeSingle();
        const { data: blocked } = await supabase.from("blocks")
          .select("id")
          .or(`and(blocker_id.eq.${profile.userId},blocked_id.eq.${u.id}),and(blocker_id.eq.${u.id},blocked_id.eq.${profile.userId})`)
          .maybeSingle();
        return { ...u, requestStatus: existing?.status || null, isBlocked: !!blocked };
      }));
      setSearchResults(enriched);
    }
  };

  const sendMessageRequest = async (targetId: string) => {
    await supabase.from("message_requests").insert({ sender_id: profile.userId, receiver_id: targetId });
    // Create notification for target
    await supabase.from("notifications").insert({
      user_id: targetId, type: "message_request", title: "طلب مراسلة جديد",
      body: `@${profile.username} يريد مراسلتك`, link_id: profile.userId,
    });
    searchUsers(); // Refresh
  };

  const acceptRequest = async (requestId: string, senderId: string) => {
    await supabase.from("message_requests").update({ status: "accepted" }).eq("id", requestId);
    await supabase.from("notifications").insert({
      user_id: senderId, type: "message_request", title: "تم قبول طلبك",
      body: `@${profile.username} قبل طلب المراسلة`, link_id: profile.userId,
    });
    loadPendingRequests();
    loadContacts();
  };

  const rejectRequest = async (requestId: string) => {
    await supabase.from("message_requests").update({ status: "rejected" }).eq("id", requestId);
    loadPendingRequests();
  };

  const blockUser = async (userId: string) => {
    await supabase.from("blocks").insert({ blocker_id: profile.userId, blocked_id: userId });
    // Remove message request if exists
    await supabase.from("message_requests").delete()
      .or(`and(sender_id.eq.${profile.userId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${profile.userId})`);
    setShowBlockConfirm(null);
    loadContacts();
    loadBlockedUsers();
  };

  const unblockUser = async (userId: string) => {
    await supabase.from("blocks").delete().eq("blocker_id", profile.userId).eq("blocked_id", userId);
    loadBlockedUsers();
  };

  const deleteConversation = async (contactId: string) => {
    if (!profile.userId) return;
    // Save to trash
    const currentMessages = await supabase.from("direct_messages")
      .select("*")
      .or(`and(sender_id.eq.${profile.userId},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${profile.userId})`)
      .order("created_at", { ascending: true });
    
    if (currentMessages.data) {
      await supabase.from("deleted_conversations").insert({
        user_id: profile.userId, contact_id: contactId, messages: currentMessages.data as any,
      });
    }
    // Delete actual messages
    await supabase.from("direct_messages").delete()
      .or(`and(sender_id.eq.${profile.userId},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${profile.userId})`);
    setShowDeleteConfirm(null);
    if (chatTarget?.id === contactId) { setChatTarget(null); setTab("contacts"); }
    loadContacts();
  };

  const restoreConversation = async (deletedId: string) => {
    const { data } = await supabase.from("deleted_conversations").select("*").eq("id", deletedId).maybeSingle();
    if (data?.messages) {
      const msgs = data.messages as any[];
      for (const msg of msgs) {
        await supabase.from("direct_messages").insert({
          sender_id: msg.sender_id, receiver_id: msg.receiver_id, content: msg.content,
        });
      }
      await supabase.from("deleted_conversations").delete().eq("id", deletedId);
      loadContacts();
      setTab("contacts");
    }
  };

  const loadTrash = async () => {
    if (!profile.userId) return;
    const { data } = await supabase.from("deleted_conversations")
      .select("*").eq("user_id", profile.userId).gt("expires_at", new Date().toISOString());
    if (data) {
      const contactIds = [...new Set(data.map(d => d.contact_id))];
      const { data: profiles } = await supabase.from("profiles").select("id, username, avatar_url").in("id", contactIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      setDeletedConvos(data.map(d => ({ ...d, contact: profileMap.get(d.contact_id) })));
    }
  };

  const sendMessage = async (mediaUrl?: string, mediaType?: string) => {
    const content = msgInput.trim();
    if (!content && !mediaUrl) return;
    if (!chatTarget || !profile.userId) return;

    const tempId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: tempId, content: content || "", sender_id: profile.userId,
      created_at: new Date().toISOString(), status: "sent", media_url: mediaUrl, media_type: mediaType, is_read: false,
    }]);
    setMsgInput("");

    const insertData: any = { sender_id: profile.userId, receiver_id: chatTarget.id, content: content || "" };
    if (mediaUrl) { insertData.media_url = mediaUrl; insertData.media_type = mediaType; }
    
    await supabase.from("direct_messages").insert(insertData);
    // Create notification
    await supabase.from("notifications").insert({
      user_id: chatTarget.id, type: "message", title: "رسالة جديدة",
      body: `@${profile.username}: ${content || "وسائط"}`, link_id: profile.userId,
    });
  };

  const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const ext = file.name.split(".").pop() || "file";
    const path = `dm/${profile.userId}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from("uploads").upload(path, file);
    if (error) { console.error("Upload error:", error); return; }
    const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(path);
    sendMessage(urlData.publicUrl, type);
    e.target.value = "";
  };

  // Voice recording
  const startRecording = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "ar-SA";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event: any) => {
      let t = "";
      for (let i = 0; i < event.results.length; i++) t += event.results[i][0].transcript;
      recordingTextRef.current = t;
      setRecordingText(t);
    };
    recognition.onerror = () => { setIsRecording(false); setRecordingText(""); };
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setRecordingText("");
  };

  const stopRecording = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsRecording(false);
    const finalText = recordingTextRef.current.trim();
    if (finalText) setMsgInput(prev => prev + " " + finalText);
    setRecordingText("");
  };

  const getMessageStatus = (msg: DirectMessage) => {
    if (msg.sender_id !== profile.userId) return null;
    if (msg.is_read) return "قُرئت";
    if (msg.status === "delivered") return "وصلت";
    return "أُرسلت";
  };

  const openChat = (contact: Contact) => {
    setChatTarget(contact);
    setTab("chat");
  };

  // Ask Ro in conversation
  const askRoAboutChat = async () => {
    if (!chatTarget || messages.length === 0) return;
    setAskRoActive(true);
    const lastMsgs = messages.slice(-10).map(m => `${m.sender_id === profile.userId ? "أنا" : chatTarget.username}: ${m.content}`).join("\n");
    
    try {
      const { data } = await supabase.functions.invoke("chat", {
        body: {
          messages: [
            { role: "system", content: "أنت Ro مساعد ذكي. شخص طلب منك التعليق على محادثة. علّق بإيجاز ولطف." },
            { role: "user", content: `علّق على هذه المحادثة:\n${lastMsgs}` },
          ],
          mode: "lite",
        },
      });
      
      const roComment = data || "لم أستطع التعليق 😅";
      const tempId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: tempId, content: `🤖 تعليق Ro: ${typeof roComment === 'string' ? roComment : JSON.stringify(roComment)}`,
        sender_id: "ro-bot", created_at: new Date().toISOString(), status: "sent", is_read: true,
      }]);
    } catch {}
    setAskRoActive(false);
  };

  if (!isOpen) return null;

  // Chat view
  if (tab === "chat" && chatTarget) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[140] bg-background flex flex-col" dir="rtl">
        <header className="flex items-center justify-between px-3 py-2.5 border-b bg-card">
          <div className="flex items-center gap-2">
            <button onClick={() => { setChatTarget(null); setTab("contacts"); loadContacts(); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
              {chatTarget.avatar_url ? <img src={chatTarget.avatar_url} alt="" className="w-full h-full object-cover" /> : <span>👤</span>}
            </div>
            <div>
              <p className="text-sm font-bold">@{chatTarget.username}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={askRoAboutChat} disabled={askRoActive} className={`p-1.5 rounded-lg transition-all ${askRoActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`} title="اسأل Ro">
              <img src={roLogo} alt="Ro" className="w-5 h-5 rounded-md" />
            </button>
            <button onClick={() => setShowBlockConfirm(chatTarget.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive">
              <Ban className="w-4 h-4" />
            </button>
            <button onClick={() => setShowDeleteConfirm(chatTarget.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {messages.length === 0 && <p className="text-center text-sm text-muted-foreground py-12">ابدأ المحادثة 💬</p>}
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.sender_id === profile.userId ? "justify-start" : msg.sender_id === "ro-bot" ? "justify-center" : "justify-end"}`}>
              {msg.sender_id === "ro-bot" ? (
                <div className="bg-primary/10 rounded-2xl px-3.5 py-2 text-sm max-w-[85%] border border-primary/20">
                  <p>{msg.content}</p>
                </div>
              ) : (
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                  msg.sender_id === profile.userId ? "bg-primary text-primary-foreground rounded-br-md" : "bg-secondary text-foreground rounded-bl-md"
                }`}>
                  {msg.media_url && msg.media_type === "image" && (
                    <img src={msg.media_url} alt="" className="w-full rounded-xl mb-1 max-h-48 object-cover" />
                  )}
                  {msg.media_url && msg.media_type === "video" && (
                    <video src={msg.media_url} controls className="w-full rounded-xl mb-1 max-h-48" />
                  )}
                  {msg.media_url && msg.media_type === "audio" && (
                    <audio src={msg.media_url} controls className="w-full mb-1" />
                  )}
                  {msg.content && <p>{msg.content}</p>}
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-[9px] opacity-60">{new Date(msg.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}</p>
                    {getMessageStatus(msg) && (
                      <p className="text-[9px] opacity-60 mr-1">{getMessageStatus(msg)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </main>

        {/* Input */}
        <div className="px-3 pb-3 pt-1.5">
          <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const type = file.type.startsWith("image") ? "image" : file.type.startsWith("video") ? "video" : "audio";
            handleMediaSelect(e, type);
          }} />
          {isRecording ? (
            <div className="flex items-center gap-3 bg-secondary rounded-2xl border px-3 py-3">
              <button onClick={stopRecording} className="ro-send-btn-circle flex-shrink-0"><Square className="w-3.5 h-3.5" fill="currentColor" /></button>
              <div className="flex-1 flex items-center gap-0.5 justify-center">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div key={i} className="w-[3px] rounded-full bg-foreground/40" style={{ height: `${8 + Math.random() * 16}px`, animation: `waveform 0.8s ease-in-out ${i * 0.05}s infinite alternate` }} />
                ))}
              </div>
              <span className="text-xs text-muted-foreground truncate max-w-[100px]">{recordingText || "تكلم..."}</span>
              <button onClick={() => { if (recognitionRef.current) recognitionRef.current.stop(); setIsRecording(false); setRecordingText(""); }} className="p-2 rounded-full text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-secondary rounded-2xl border px-3 py-2">
              <button onClick={() => sendMessage()} disabled={!msgInput.trim()} className="ro-send-btn-circle disabled:opacity-30 flex-shrink-0">
                <ArrowUp className="w-4 h-4" />
              </button>
              <button onClick={startRecording} className="p-1.5 rounded-full text-muted-foreground hover:text-foreground"><Mic className="w-4 h-4" /></button>
              <textarea value={msgInput} onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="اكتب رسالة..." rows={1}
                className="flex-1 bg-transparent outline-none text-sm resize-none placeholder:text-muted-foreground/60 max-h-[80px]" />
              <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded-full text-muted-foreground hover:text-foreground">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Confirm dialogs */}
        <ConfirmDialog show={!!showDeleteConfirm} title="حذف المحادثة؟" body="ستُنقل إلى المهملات لمدة 10 أيام ويمكنك استعادتها."
          onConfirm={() => deleteConversation(showDeleteConfirm!)} onCancel={() => setShowDeleteConfirm(null)} />
        <ConfirmDialog show={!!showBlockConfirm} title="حظر هذا المستخدم؟" body="لن يتمكن من مراسلتك بعد الآن."
          onConfirm={() => blockUser(showBlockConfirm!)} onCancel={() => setShowBlockConfirm(null)} />
      </motion.div>
    );
  }

  // Main hub view
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[140] bg-background flex flex-col" dir="rtl">
      <header className="flex items-center justify-between px-3 py-2.5 border-b bg-card">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
            <ChevronRight className="w-5 h-5" />
          </button>
          <MessageCircle className="w-5 h-5 text-primary" />
          <span className="font-bold text-sm">المراسلات</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => { setTab("search"); setSearchResults([]); setSearchQuery(""); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex border-b bg-card px-2 gap-1 overflow-x-auto">
        {[
          { key: "contacts" as Tab, label: "جهات الاتصال", icon: Users, badge: totalUnread },
          { key: "requests" as Tab, label: "الطلبات", icon: Bell, badge: requestCount },
          { key: "blocked" as Tab, label: "المحظورين", icon: Ban },
          { key: "trash" as Tab, label: "المهملات", icon: Trash2 },
        ].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); if (t.key === "trash") loadTrash(); }}
            className={`flex items-center gap-1 px-3 py-2.5 text-xs font-medium border-b-2 transition-all relative whitespace-nowrap ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.badge && t.badge > 0 && (
              <span className="w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-bold mr-0.5">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <main className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* CONTACTS TAB */}
        {tab === "contacts" && (
          <>
            {loading ? (
              <div className="flex justify-center py-8"><div className="ro-loading-dot" /></div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-12">
                <MessageCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">لا توجد محادثات بعد</p>
                <button onClick={() => setTab("search")} className="mt-3 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium">
                  ابحث عن أصدقاء
                </button>
              </div>
            ) : contacts.map(c => (
              <div key={c.id} onClick={() => openChat(c)}
                className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-secondary transition-all cursor-pointer">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                  {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : <span>👤</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">@{c.username}</p>
                  {c.lastMessage && <p className="text-xs text-muted-foreground truncate">{c.lastMessage}</p>}
                </div>
                {c.unread > 0 && (
                  <span className="w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">
                    {c.unread}
                  </span>
                )}
                {c.lastMessageTime && (
                  <span className="text-[10px] text-muted-foreground">{new Date(c.lastMessageTime).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}</span>
                )}
              </div>
            ))}
          </>
        )}

        {/* SEARCH TAB */}
        {tab === "search" && (
          <>
            <div className="flex gap-2 mb-3">
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") searchUsers(); }}
                placeholder="ابحث باسم المستخدم..."
                className="flex-1 bg-secondary rounded-xl border px-3 py-2 text-sm outline-none focus:border-primary" />
              <button onClick={searchUsers} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">بحث</button>
            </div>
            {searchResults.map(u => (
              <div key={u.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-secondary/50 mb-1.5">
                <div className="w-9 h-9 rounded-xl overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                  {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : <span>👤</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">@{u.username}</p>
                  <p className="text-xs text-muted-foreground">{u.display_name}</p>
                </div>
                {u.isBlocked ? (
                  <span className="text-[10px] text-destructive">محظور</span>
                ) : u.requestStatus === "accepted" ? (
                  <span className="text-[10px] text-green-500">متصل ✅</span>
                ) : u.requestStatus === "pending" ? (
                  <span className="text-[10px] text-yellow-500">بانتظار ⏳</span>
                ) : (
                  <button onClick={() => sendMessageRequest(u.id)} className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-[11px] font-medium">
                    إرسال طلب
                  </button>
                )}
              </div>
            ))}
            {searchResults.length === 0 && searchQuery && <p className="text-center text-sm text-muted-foreground py-8">لا نتائج</p>}
          </>
        )}

        {/* REQUESTS TAB */}
        {tab === "requests" && (
          <>
            {pendingRequests.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">لا توجد طلبات مراسلة</p>
            ) : pendingRequests.map(req => (
              <div key={req.id} className="p-3 rounded-xl bg-secondary/50 border mb-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
                    {req.senderProfile?.avatar_url ? <img src={req.senderProfile.avatar_url} alt="" className="w-full h-full object-cover" /> : <span>👤</span>}
                  </div>
                  <p className="text-sm font-medium">@{req.senderProfile?.username || "مجهول"}</p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => acceptRequest(req.id, req.sender_id)} className="flex-1 py-2 rounded-xl bg-green-500/20 text-green-600 text-xs font-medium hover:bg-green-500/30">قبول</button>
                  <button onClick={() => rejectRequest(req.id)} className="flex-1 py-2 rounded-xl bg-secondary text-muted-foreground text-xs font-medium hover:bg-muted">رفض</button>
                  <button onClick={() => { setShowBlockConfirm(req.sender_id); }} className="py-2 px-3 rounded-xl bg-destructive/20 text-destructive text-xs font-medium">حظر</button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* BLOCKED TAB */}
        {tab === "blocked" && (
          <>
            {blockedUsers.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">لا يوجد محظورين</p>
            ) : blockedUsers.map(u => (
              <div key={u.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-secondary/50 mb-1.5">
                <div className="w-9 h-9 rounded-xl overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                  {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : <span>👤</span>}
                </div>
                <p className="text-sm font-medium flex-1">@{u.username}</p>
                <button onClick={() => unblockUser(u.id)} className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-[11px] font-medium">إلغاء الحظر</button>
              </div>
            ))}
          </>
        )}

        {/* TRASH TAB */}
        {tab === "trash" && (
          <>
            {deletedConvos.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">سلة المهملات فارغة</p>
            ) : deletedConvos.map(d => (
              <div key={d.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-secondary/50 mb-1.5">
                <div className="w-9 h-9 rounded-xl overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                  {d.contact?.avatar_url ? <img src={d.contact.avatar_url} alt="" className="w-full h-full object-cover" /> : <span>👤</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">@{d.contact?.username || "محذوف"}</p>
                  <p className="text-[10px] text-muted-foreground">تنتهي: {new Date(d.expires_at).toLocaleDateString("ar")}</p>
                </div>
                <button onClick={() => restoreConversation(d.id)} className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-[11px] font-medium">استعادة</button>
              </div>
            ))}
          </>
        )}
      </main>

      <ConfirmDialog show={!!showBlockConfirm} title="حظر هذا المستخدم؟" body="لن يتمكن من مراسلتك بعد الآن."
        onConfirm={() => blockUser(showBlockConfirm!)} onCancel={() => setShowBlockConfirm(null)} />
    </motion.div>
  );
}

function ConfirmDialog({ show, title, body, onConfirm, onCancel }: { show: boolean; title: string; body: string; onConfirm: () => void; onCancel: () => void }) {
  if (!show) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "hsla(var(--background) / 0.7)", backdropFilter: "blur(4px)" }}>
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-card rounded-2xl border p-5 max-w-xs w-full shadow-2xl text-center space-y-3" dir="rtl">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-muted-foreground">{body}</p>
        <div className="flex gap-2">
          <button onClick={onConfirm} className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium">تأكيد</button>
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium">إلغاء</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
