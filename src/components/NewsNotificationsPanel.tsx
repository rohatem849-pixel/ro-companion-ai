import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Newspaper, Bell, ExternalLink, MessageCircle } from "lucide-react";
import { UserProfile, Task } from "@/lib/userProfile";
import { supabase } from "@/integrations/supabase/client";
import roLogo from "@/assets/ro-logo.png";

interface Props {
  profile: UserProfile;
  tasks: Task[];
  onClose: () => void;
  onAskRo: (question: string) => void;
  onNotificationCountChange: (count: number) => void;
}

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  category?: string;
}

interface Notification {
  id: string;
  message: string;
  type: "task" | "habit_good" | "habit_bad";
  time: string;
  read: boolean;
}

export default function NewsNotificationsPanel({ profile, tasks, onClose, onAskRo, onNotificationCountChange }: Props) {
  const [tab, setTab] = useState<"news" | "notifications">("news");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Fetch news
  useEffect(() => {
    const fetchNews = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("news", {
          body: {
            country: profile.country || "",
            hobbies: profile.hobbies || "",
          },
        });
        if (!error && data?.articles) {
          setNews(data.articles);
        }
      } catch (e) {
        console.error("News fetch failed:", e);
      }
      setLoading(false);
    };
    fetchNews();
  }, [profile.country, profile.hobbies]);

  // Generate notifications
  useEffect(() => {
    const notifs: Notification[] = [];
    const now = new Date();
    const hour = now.getHours();

    const pendingTasks = tasks.filter(t => !t.done);
    if (pendingTasks.length > 0) {
      notifs.push({
        id: "tasks-reminder",
        message: `عندك ${pendingTasks.length} مهمة لم تنجزها بعد! 💪 يلا نخلصهم`,
        type: "task",
        time: "الآن",
        read: false,
      });
    }

    if (profile.goodHabit) {
      notifs.push({
        id: "good-habit",
        message: `كيف حالك مع "${profile.goodHabit}"؟ 🌟 أنت قادر!`,
        type: "habit_good",
        time: hour >= 15 ? "هذا المساء" : "اليوم",
        read: false,
      });
    }

    if (profile.badHabit) {
      notifs.push({
        id: "bad-habit",
        message: `تذكر هدفك بترك "${profile.badHabit}" 💪 كل يوم بدونها هو إنجاز!`,
        type: "habit_bad",
        time: hour >= 18 ? "مساء الخير" : "تذكير",
        read: false,
      });
    }

    setNotifications(notifs);
    onNotificationCountChange(notifs.filter(n => !n.read).length);
  }, [tasks, profile.goodHabit, profile.badHabit]);

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    onNotificationCountChange(0);
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="border-b overflow-hidden bg-card"
    >
      <div className="p-3 max-h-[60vh] overflow-y-auto" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setTab("news")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${tab === "news" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
            >
              <Newspaper className="w-3 h-3" /> أخبار
            </button>
            <button
              onClick={() => { setTab("notifications"); markAllRead(); }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${tab === "notifications" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
            >
              <Bell className="w-3 h-3" /> إشعارات
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center">
                  {notifications.filter(n => !n.read).length}
                </span>
              )}
            </button>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* News tab */}
        {tab === "news" && (
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="ro-loading-dot" style={{ animationDelay: "0ms" }} />
                <div className="ro-loading-dot mx-1" style={{ animationDelay: "150ms" }} />
                <div className="ro-loading-dot" style={{ animationDelay: "300ms" }} />
              </div>
            ) : news.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">لا أخبار حالياً</p>
            ) : (
              news.map((item, i) => (
                <div key={i} className="p-3 rounded-xl border bg-background hover:bg-secondary/50 transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium leading-relaxed mb-1">{item.title}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{item.source}</span>
                        {item.category && <span className="px-1.5 py-0.5 rounded bg-secondary">{item.category}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-all">
                      <ExternalLink className="w-2.5 h-2.5" /> المقال
                    </a>
                    <button
                      onClick={() => onAskRo(`اشرح لي هذا الخبر وأعطني أهم النقاط: ${item.title}`)}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                    >
                      <MessageCircle className="w-2.5 h-2.5" /> اسأل Ro
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Notifications tab */}
        {tab === "notifications" && (
          <div className="space-y-2">
            {notifications.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">لا إشعارات ✨</p>
            ) : (
              notifications.map(notif => (
                <div key={notif.id} className="flex items-start gap-2.5 p-3 rounded-xl border bg-background">
                  <img src={roLogo} alt="Ro" className="w-6 h-6 rounded-lg flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">Ro · {notif.time}</p>
                    <p className="text-sm leading-relaxed">{notif.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
