import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageSquare, Settings, Pin, Trash2, Download, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UserProfile } from "@/lib/userProfile";

interface SavedConversation {
  id: string;
  title: string;
  mode: string;
  pinned: boolean;
  updated_at: string;
  messages: any[];
}

interface DirectContact {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  lastMessage?: string;
  unread?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onLoadConversation: (messages: any[], mode: string) => void;
  onOpenSettings: () => void;
  directContacts: DirectContact[];
  onOpenDirectChat: (contact: DirectContact) => void;
}

export default function AppSidebar({ isOpen, onClose, profile, onLoadConversation, onOpenSettings, directContacts, onOpenDirectChat }: Props) {
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && profile.userId) {
      loadConversations();
    }
  }, [isOpen, profile.userId]);

  const loadConversations = async () => {
    if (!profile.userId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("user_id", profile.userId)
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(50);
      if (data) setConversations(data as any);
    } catch {}
    setLoading(false);
  };

  const deleteConversation = async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
    setConversations(prev => prev.filter(c => c.id !== id));
  };

  const togglePin = async (id: string, pinned: boolean) => {
    await supabase.from("conversations").update({ pinned: !pinned }).eq("id", id);
    setConversations(prev => prev.map(c => c.id === id ? { ...c, pinned: !pinned } : c));
  };

  const installPWA = () => {
    const deferredPrompt = (window as any).__pwaInstallPrompt;
    if (deferredPrompt) {
      deferredPrompt.prompt();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: 300 }}
            animate={{ x: 0 }}
            exit={{ x: 300 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-0 right-0 h-full w-[280px] z-[151] bg-card border-l shadow-2xl flex flex-col"
            dir="rtl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-sm font-bold">القائمة</h2>
              <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Conversations */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <p className="text-[11px] font-bold text-muted-foreground mb-2 px-1">💬 المحادثات المحفوظة</p>
              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="ro-loading-dot" />
                </div>
              ) : conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">لا محادثات محفوظة</p>
              ) : (
                conversations.map(conv => (
                  <div
                    key={conv.id}
                    className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-secondary transition-all cursor-pointer group"
                    onClick={() => {
                      onLoadConversation(conv.messages as any[], conv.mode);
                      onClose();
                    }}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{conv.title}</p>
                      <p className="text-[10px] text-muted-foreground">{conv.mode === "ryo" ? "Ryo Ai" : "Lite"}</p>
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePin(conv.id, conv.pinned); }}
                        className={`p-1 rounded-lg hover:bg-background ${conv.pinned ? "text-primary" : "text-muted-foreground"}`}
                      >
                        <Pin className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                        className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-background"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}

              {/* Direct messages */}
              {directContacts.length > 0 && (
                <>
                  <div className="border-t my-3" />
                  <p className="text-[11px] font-bold text-muted-foreground mb-2 px-1" style={{ color: "hsl(142, 70%, 45%)" }}>💬 الرسائل المباشرة</p>
                  {directContacts.map(contact => (
                    <div
                      key={contact.id}
                      className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-secondary transition-all cursor-pointer"
                      style={{ borderRight: "3px solid hsl(142, 70%, 45%)" }}
                      onClick={() => { onOpenDirectChat(contact); onClose(); }}
                    >
                      <div className="w-7 h-7 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                        {contact.avatar_url ? (
                          <img src={contact.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs">🧱</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">@{contact.username}</p>
                        {contact.lastMessage && (
                          <p className="text-[10px] text-muted-foreground truncate">{contact.lastMessage}</p>
                        )}
                      </div>
                      {contact.unread && contact.unread > 0 && (
                        <span className="w-4 h-4 rounded-full bg-green-500 text-white text-[9px] flex items-center justify-center font-bold">
                          {contact.unread}
                        </span>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Bottom actions */}
            <div className="border-t p-3 space-y-1">
              <button
                onClick={() => { onOpenSettings(); onClose(); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              >
                <Settings className="w-4 h-4" /> الإعدادات
              </button>
              <button
                onClick={installPWA}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              >
                <Download className="w-4 h-4" /> تثبيت التطبيق
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
