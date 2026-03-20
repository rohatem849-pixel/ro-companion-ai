import { useState, useEffect, useMemo } from "react";
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

const DEFAULT_TASK_HOURS = [13, 15, 16, 20];
const DEFAULT_HABIT_HOURS = [15, 18, 21];
const GOOD_HABIT_LABEL = "3:20 مساءً · 6:00 مساءً · 9:00 مساءً";
const TASK_LABEL = "1:00 ظهرًا · 3:00 عصرًا · 4:00 عصرًا · 8:00 مساءً";

function normalizeCountry(country: string) {
  const trimmed = country.trim().toLowerCase();
  if (!trimmed) return "saudi";
  if (["saudi", "saudi arabia", "ksa", "السعودية", "المملكة العربية السعودية"].includes(trimmed)) return "saudi";
  return trimmed;
}

function isDueNow(currentHour: number, allowedHours: number[]) {
  return allowedHours.includes(currentHour);
}

export default function NewsNotificationsPanel({ profile, tasks, onClose, onAskRo, onNotificationCountChange }: Props) {
  const [tab, setTab] = useState<"news" | "notifications">("news");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const timezone = useMemo(() => {
    const country = normalizeCountry(profile.country || "");
    return country === "saudi" ? "Asia/Riyadh" : Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Riyadh";
  }, [profile.country]);

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

  useEffect(() => {
    const buildNotifications = () => {
      const notifs: Notification[] = [];
      const now = new Date();
      const hour = Number(
        new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          hour12: false,
          timeZone: timezone,
        }).format(now)
      );

      const pendingTasks = tasks.filter((t) => !t.done);
      const habitHours = DEFAULT_HABIT_HOURS;
      const taskHours = DEFAULT_TASK_HOURS;

      if (pendingTasks.length > 0 && isDueNow(hour, taskHours)) {
        notifs.push({
          id: `tasks-${hour}`,
          message: `عندك ${pendingTasks.length} مهمة لسا بانتظارك ✨ خلّينا ننهي واحدة الآن خطوة خطوة.`,
          type: "task",
          time: TASK_LABEL,
          read: false,
        });
      }

      if (profile.goodHabit && isDueNow(hour, habitHours)) {
        notifs.push({
          id: `good-habit-${hour}`,
          message: `كيف ماشي مع عادة "${profile.goodHabit}"؟ 🌱 حتى خطوة صغيرة اليوم تُحسب لك.`,
          type: "habit_good",
          time: GOOD_HABIT_LABEL,
          read: false,
        });
      }

      if (profile.badHabit && isDueNow(hour, habitHours)) {
        notifs.push({
          id: `bad-habit-${hour}`,
          message: `تذكير لطيف بخصوص "${profile.badHabit}" 🤍 يوم جديد بعيد عنها يعني تقدّم حقيقي.`,
          type: "habit_bad",
          time: GOOD_HABIT_LABEL,
          read: false,
        });
      }

      setNotifications(notifs);
      onNotificationCountChange(notifs.filter((n) => !n.read).length);
    };

    buildNotifications();
    const interval = window.setInterval(buildNotifications, 60_000);
    return () => window.clearInterval(interval);
  }, [tasks, profile.goodHabit, profile.badHabit, timezone, onNotificationCountChange]);

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
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
              {notifications.filter((n) => !n.read).length > 0 && (
                <span className="w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center">
                  {notifications.filter((n) => !n.read).length}
                </span>
              )}
            </button>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

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

        {tab === "notifications" && (
          <div className="space-y-2">
            {notifications.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">لا إشعارات حالياً في هذا الوقت ✨</p>
            ) : (
              notifications.map((notif) => (
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
