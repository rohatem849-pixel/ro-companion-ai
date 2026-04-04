import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, X, Camera } from "lucide-react";
import { UserProfile, saveProfile } from "@/lib/userProfile";
import { validateProfileField } from "@/lib/inputValidation";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  onComplete: (profile: UserProfile) => void;
}

const steps = [
  { key: "username", label: "اختر اسم مستخدم فريد 🆔", placeholder: "مثال: ahmed_123", emoji: "🆔" },
  { key: "name", label: "ما اسمك؟ 😊", placeholder: "اكتب اسمك هنا...", emoji: "😊" },
  { key: "work", label: "ما عملك؟ 💼", placeholder: "مثال: طالب، مبرمج، مصمم...", emoji: "💼", hasSubQuestion: true },
  { key: "hobbies", label: "ما هواياتك؟ 🎨", placeholder: "مثال: القراءة، البرمجة، الرسم...", emoji: "🎨" },
  { key: "country", label: "من أي دولة أنت؟ 🌍", placeholder: "اكتب دولتك...", emoji: "🌍" },
];

export default function OnboardingFlow({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<UserProfile>({
    name: "", username: "", userId: "", work: "", schoolLevel: "", hobbies: "", country: "",
    importantNotes: "", badHabit: "", goodHabit: "", avatarUrl: "", onboardingDone: false, notificationsEnabled: true, language: "ar",
  });
  const [showSchoolLevel, setShowSchoolLevel] = useState(false);
  const [error, setError] = useState("");
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [language, setLanguage] = useState<"ar" | "en" | "fr" | "es" | "tr">("ar");

  const current = steps[step];

  const languages = [
    { code: "ar" as const, label: "العربية", flag: "🇸🇦" },
    { code: "en" as const, label: "English", flag: "🇺🇸" },
    { code: "fr" as const, label: "Français", flag: "🇫🇷" },
    { code: "es" as const, label: "Español", flag: "🇪🇸" },
    { code: "tr" as const, label: "Türkçe", flag: "🇹🇷" },
  ];

  const validateAndProceed = async (key: string, value: string, next: () => void) => {
    if (key === "username") {
      const username = value.trim().toLowerCase();
      if (!username || username.length < 3) {
        setError("اسم المستخدم يجب أن يكون 3 أحرف على الأقل");
        return;
      }
      if (!/^[a-z0-9._]+$/.test(username)) {
        setError("اسم المستخدم يجب أن يحتوي فقط على حروف إنجليزية وأرقام و . أو _");
        return;
      }
      setCheckingUsername(true);
      try {
        const { data } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
        if (data) {
          setError("اسم المستخدم مأخوذ، جرب اسماً آخر 😅");
          setCheckingUsername(false);
          return;
        }
      } catch {}
      setCheckingUsername(false);
      setError("");
      next();
      return;
    }

    const v = validateProfileField(key, value);
    if (!v.valid) {
      setError(v.message || "");
      return;
    }
    setError("");
    next();
  };

  const handleNext = () => {
    const currentKey = showSchoolLevel ? "schoolLevel" : current.key;
    const currentVal = (profile as any)[currentKey] || "";

    validateAndProceed(currentKey, currentVal, () => {
      if (step === 2 && (profile.work.includes("مدرسة") || profile.work.includes("طالب") || profile.work.includes("دراسة"))) {
        if (!showSchoolLevel) {
          setShowSchoolLevel(true);
          return;
        }
      }
      setShowSchoolLevel(false);
      if (step < steps.length - 1) {
        setStep(step + 1);
      } else {
        finishOnboarding();
      }
    });
  };

  const handlePrev = () => {
    setError("");
    if (showSchoolLevel) {
      setShowSchoolLevel(false);
      return;
    }
    if (step > 0) setStep(step - 1);
  };

  const skipQuestion = () => {
    if (current.key === "username") {
      setError("اسم المستخدم مطلوب ولا يمكن تخطيه");
      return;
    }
    setError("");
    setShowSchoolLevel(false);
    if (step < steps.length - 1) setStep(step + 1);
    else finishOnboarding();
  };

  const skipAll = () => {
    if (!profile.username.trim() || profile.username.trim().length < 3) {
      setError("اسم المستخدم مطلوب");
      return;
    }
    finishOnboarding();
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setAvatarPreview(base64);
      setProfile(prev => ({ ...prev, avatarUrl: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const finishOnboarding = async () => {
    const userId = crypto.randomUUID();
    const username = profile.username.trim().toLowerCase();
    const final: UserProfile = {
      ...profile,
      username,
      userId,
      language,
      onboardingDone: true,
    };

    try {
      await supabase.from("profiles").insert({
        id: userId,
        username,
        display_name: profile.name || username,
        work: profile.work || null,
        school_level: profile.schoolLevel || null,
        hobbies: profile.hobbies || null,
        country: profile.country || null,
        avatar_url: profile.avatarUrl || null,
      });
    } catch (e) {
      console.error("Profile save error:", e);
    }

    saveProfile(final);
    onComplete(final);
  };

  const updateField = (key: string, value: string) => {
    setProfile(prev => ({ ...prev, [key]: value }));
    setError("");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "hsla(var(--background) / 0.97)", backdropFilter: "blur(12px)" }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-6" dir="rtl">
        {step === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2 flex-wrap justify-center">
            {languages.map(lang => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  language === lang.code ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-transparent hover:bg-muted"
                }`}
              >
                {lang.flag} {lang.label}
              </button>
            ))}
          </motion.div>
        )}

        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center">
          <span className="text-3xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: "var(--ro-gradient)" }}>
            Ro
          </span>
          <p className="text-sm mt-1 text-muted-foreground">سؤالين صغار لأعرفك أكثر ✨</p>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={showSchoolLevel ? "school" : step}
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ duration: 0.2 }}
            className="w-full rounded-3xl p-6 shadow-2xl border bg-card overflow-hidden"
            style={{ borderColor: "hsl(var(--primary) / 0.18)" }}
          >
            {showSchoolLevel ? (
              <div className="flex flex-col gap-4">
                <h2 className="text-lg font-bold text-right leading-relaxed">أي مستوى دراسي؟ 📚</h2>
                <input
                  dir="rtl"
                  placeholder="مثال: ثانوي، جامعي..."
                  className="w-full rounded-2xl px-4 py-3 text-sm text-right outline-none transition-all border bg-secondary text-foreground placeholder:text-muted-foreground focus:border-primary"
                  value={profile.schoolLevel}
                  onChange={e => updateField("schoolLevel", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleNext()}
                />
                {error && <p className="text-[11px] text-destructive">{error}</p>}
              </div>
            ) : current.key === "username" ? (
              <div className="flex flex-col gap-4">
                <h2 className="text-lg font-bold text-right leading-relaxed">{current.label}</h2>
                <div className="flex items-center gap-3 justify-center">
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
                    <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center overflow-hidden bg-secondary hover:bg-muted transition-all">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <Camera className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center mt-1">اختياري</p>
                  </label>
                </div>
                <input
                  dir="ltr"
                  placeholder={current.placeholder}
                  className="w-full rounded-2xl px-4 py-3 text-sm text-left outline-none transition-all border bg-secondary text-foreground placeholder:text-muted-foreground focus:border-primary"
                  value={profile.username}
                  onChange={e => updateField("username", e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ""))}
                  onKeyDown={e => e.key === "Enter" && handleNext()}
                  autoFocus
                />
                <p className="text-[10px] text-muted-foreground">
                  حروف إنجليزية صغيرة وأرقام فقط • لا يمكن تغييره لاحقاً
                </p>
                {error && <p className="text-[11px] text-destructive">{error}</p>}
                {checkingUsername && <p className="text-[11px] text-muted-foreground">جاري التحقق...</p>}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <h2 className="text-lg font-bold text-right leading-relaxed">{current.label}</h2>
                <input
                  dir="rtl"
                  placeholder={current.placeholder}
                  className="w-full rounded-2xl px-4 py-3 text-sm text-right outline-none transition-all border bg-secondary text-foreground placeholder:text-muted-foreground focus:border-primary"
                  value={(profile as any)[current.key] || ""}
                  onChange={e => updateField(current.key, e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleNext()}
                  autoFocus
                />
                {error && <p className="text-[11px] text-destructive">{error}</p>}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between w-full">
          <button
            onClick={handleNext}
            disabled={checkingUsername}
            className="p-2.5 rounded-xl transition-all bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all"
                style={{
                  height: 6,
                  width: i === step ? 20 : 6,
                  backgroundColor: i === step ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.2)",
                }}
              />
            ))}
          </div>
          <button
            onClick={handlePrev}
            className={`p-2.5 rounded-xl transition-all text-primary hover:bg-secondary ${step === 0 && !showSchoolLevel ? "opacity-0 pointer-events-none" : ""}`}
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-4">
          <button onClick={skipQuestion} className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-xl">
            تخطي هذا السؤال
          </button>
          <button onClick={skipAll} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-xl flex items-center gap-1">
            <X className="w-3 h-3" />
            تخطي الكل
          </button>
        </div>
      </div>
    </motion.div>
  );
}
