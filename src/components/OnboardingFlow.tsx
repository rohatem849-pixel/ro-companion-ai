import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { UserProfile, saveProfile } from "@/lib/userProfile";

interface Props {
  onComplete: (profile: UserProfile) => void;
}

const steps = [
  { key: "name", label: "ما اسمك؟ 😊", placeholder: "اكتب اسمك هنا...", emoji: "😊" },
  { key: "work", label: "ما عملك؟ 💼", placeholder: "مثال: طالب، مبرمج، مصمم...", emoji: "💼", hasSubQuestion: true },
  { key: "hobbies", label: "ما هواياتك؟ 🎨", placeholder: "مثال: القراءة، البرمجة، الرسم...", emoji: "🎨" },
  { key: "country", label: "من أي دولة أنت؟ 🌍", placeholder: "اكتب دولتك...", emoji: "🌍" },
];

export default function OnboardingFlow({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<UserProfile>({
    name: "", work: "", schoolLevel: "", hobbies: "", country: "",
    importantNotes: "", badHabit: "", goodHabit: "", onboardingDone: false,
  });
  const [showSchoolLevel, setShowSchoolLevel] = useState(false);

  const current = steps[step];

  const handleNext = () => {
    if (step === 1 && profile.work.includes("مدرسة") || profile.work.includes("طالب") || profile.work.includes("دراسة")) {
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
  };

  const handlePrev = () => {
    if (showSchoolLevel) {
      setShowSchoolLevel(false);
      return;
    }
    if (step > 0) setStep(step - 1);
  };

  const skipQuestion = () => {
    setShowSchoolLevel(false);
    if (step < steps.length - 1) setStep(step + 1);
    else finishOnboarding();
  };

  const skipAll = () => finishOnboarding();

  const finishOnboarding = () => {
    const final = { ...profile, onboardingDone: true };
    saveProfile(final);
    onComplete(final);
  };

  const updateField = (key: string, value: string) => {
    setProfile(prev => ({ ...prev, [key]: value }));
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
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between w-full">
          <button
            onClick={handleNext}
            className="p-2.5 rounded-xl transition-all bg-primary text-primary-foreground hover:opacity-90"
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
