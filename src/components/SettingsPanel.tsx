import { useState, useEffect, useRef } from "react";
import { X, Camera } from "lucide-react";
import { UserProfile, saveProfile } from "@/lib/userProfile";
import { validateProfileField } from "@/lib/inputValidation";
import { checkAdminPassword, saveAdminNote, getAdminNotes, deleteAdminNote } from "@/lib/aiApi";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  profile: UserProfile;
  onUpdate: (p: UserProfile) => void;
  onClose: () => void;
  isAdmin?: boolean;
}

export default function SettingsPanel({ profile, onUpdate, onClose, isAdmin }: Props) {
  const [local, setLocal] = useState({ ...profile });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [adminNotes, setAdminNotes] = useState<Array<{ id: string; note: string }>>([]);
  const [newAdminNote, setNewAdminNote] = useState("");
  const [showAdminMemory, setShowAdminMemory] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatarUrl || null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdmin) {
      setShowAdminMemory(true);
      loadAdminNotes();
    }
  }, [isAdmin]);

  const loadAdminNotes = async () => {
    const notes = await getAdminNotes();
    setAdminNotes(notes);
  };

  const handleSaveAdminNote = async () => {
    if (!newAdminNote.trim() || !profile.importantNotes) return;
    const success = await saveAdminNote(profile.importantNotes, newAdminNote.trim());
    if (success) {
      setNewAdminNote("");
      await loadAdminNotes();
    }
  };

  const handleDeleteAdminNote = async (noteId: string) => {
    if (!profile.importantNotes) return;
    await deleteAdminNote(profile.importantNotes, noteId);
    await loadAdminNotes();
  };

  const handleChange = (key: string, value: string) => {
    setLocal(prev => ({ ...prev, [key]: value }));
    if (key === "importantNotes") {
      setErrors(prev => { const copy = { ...prev }; delete copy[key]; return copy; });
      return;
    }
    const validation = validateProfileField(key, value);
    if (!validation.valid) {
      setErrors(prev => ({ ...prev, [key]: validation.message || "" }));
    } else {
      setErrors(prev => { const copy = { ...prev }; delete copy[key]; return copy; });
    }
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setAvatarPreview(base64);

      // Upload to storage
      try {
        const ext = file.name.split(".").pop() || "jpg";
        const fileName = `avatars/${profile.userId}/${Date.now()}.${ext}`;
        const base64Data = base64.split(",")[1];
        await supabase.storage.from("uploads").upload(fileName, Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)), {
          contentType: file.type,
          upsert: true,
        });
        const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);
        setLocal(prev => ({ ...prev, avatarUrl: urlData.publicUrl }));
      } catch (err) {
        console.error("Avatar upload error:", err);
        setLocal(prev => ({ ...prev, avatarUrl: base64 }));
      }
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    let hasError = false;
    const newErrors: Record<string, string> = {};
    for (const f of fields) {
      if (f.key === "importantNotes") continue;
      const val = (local as any)[f.key] || "";
      const v = validateProfileField(f.key, val);
      if (!v.valid) {
        newErrors[f.key] = v.message || "";
        hasError = true;
      }
    }
    if (hasError) {
      setErrors(newErrors);
      return;
    }

    // Update database profile
    if (profile.userId) {
      try {
        await supabase.from("profiles").update({
          display_name: local.name || local.username,
          work: local.work || null,
          school_level: local.schoolLevel || null,
          hobbies: local.hobbies || null,
          country: local.country || null,
          important_notes: local.importantNotes || null,
          bad_habit: local.badHabit || null,
          good_habit: local.goodHabit || null,
          avatar_url: local.avatarUrl || null,
        }).eq("id", profile.userId);
      } catch (e) {
        console.error("Profile update error:", e);
      }
    }

    saveProfile(local);
    onUpdate(local);
    onClose();
  };

  const languages = [
    { code: "ar" as const, label: "العربية", flag: "🇸🇦" },
    { code: "en" as const, label: "English", flag: "🇺🇸" },
    { code: "fr" as const, label: "Français", flag: "🇫🇷" },
    { code: "es" as const, label: "Español", flag: "🇪🇸" },
    { code: "tr" as const, label: "Türkçe", flag: "🇹🇷" },
  ];

  const fields = [
    { key: "name", label: "الاسم", placeholder: "اسمك" },
    { key: "work", label: "العمل", placeholder: "عملك" },
    { key: "schoolLevel", label: "المستوى الدراسي", placeholder: "مستواك الدراسي" },
    { key: "hobbies", label: "الهوايات", placeholder: "هواياتك" },
    { key: "country", label: "الدولة", placeholder: "دولتك" },
    { key: "importantNotes", label: "ملاحظات يجب أن يتذكرها Ro", placeholder: "أشياء تريد أن يتذكرها Ro" },
    { key: "badHabit", label: "عادة تريد التخلص منها", placeholder: "عادة سيئة" },
    { key: "goodHabit", label: "عادة تريد اكتسابها", placeholder: "عادة جيدة" },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "hsla(var(--background) / 0.8)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-md bg-card rounded-3xl p-6 shadow-2xl border max-h-[85vh] overflow-y-auto" dir="rtl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">⚙️ الإعدادات</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Avatar */}
        <div className="flex items-center gap-3 mb-4">
          <label className="cursor-pointer">
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
            <div className="w-14 h-14 rounded-2xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center overflow-hidden bg-secondary hover:bg-muted transition-all">
              {avatarPreview ? (
                <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          </label>
          <div>
            <p className="text-xs font-medium">صورة الملف الشخصي</p>
            <p className="text-[10px] text-muted-foreground">اضغط لتغيير الصورة</p>
          </div>
        </div>

        {/* Username display */}
        {profile.username && (
          <div className="mb-3 p-3 rounded-xl bg-secondary">
            <p className="text-[11px] text-muted-foreground mb-1">اسم المستخدم (لا يمكن تغييره)</p>
            <p className="text-sm font-mono font-bold" dir="ltr">@{profile.username}</p>
          </div>
        )}

        {/* Language selector */}
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground mb-2 block">اللغة</label>
          <div className="flex gap-2 flex-wrap">
            {languages.map(lang => (
              <button
                key={lang.code}
                onClick={() => setLocal(prev => ({ ...prev, language: lang.code }))}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  local.language === lang.code ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-transparent hover:bg-muted"
                }`}
              >
                {lang.flag} {lang.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{f.label}</label>
              <input
                value={(local as any)[f.key] || ""}
                onChange={e => handleChange(f.key, e.target.value)}
                placeholder={f.placeholder}
                className={`w-full rounded-xl px-3 py-2.5 text-sm bg-secondary text-foreground border outline-none focus:border-primary placeholder:text-muted-foreground ${
                  errors[f.key] ? "border-destructive" : ""
                }`}
              />
              {errors[f.key] && <p className="text-[11px] text-destructive mt-1">{errors[f.key]}</p>}
            </div>
          ))}
        </div>

        {/* Admin memory section */}
        {isAdmin && showAdminMemory && (
          <div className="mt-5 p-4 rounded-2xl border-2 border-primary/20 bg-primary/5">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              🧠 ذاكرة Ro (المدير فقط)
            </h3>
            <p className="text-[10px] text-muted-foreground mb-3">
              كل ما تضيفه هنا سيحفظه Ro ويطبقه على جميع المستخدمين
            </p>
            <div className="space-y-2 mb-3">
              {adminNotes.map(note => (
                <div key={note.id} className="flex items-start gap-2 p-2 rounded-xl bg-background">
                  <p className="text-xs flex-1">{note.note}</p>
                  <button
                    onClick={() => handleDeleteAdminNote(note.id)}
                    className="p-1 rounded-lg text-muted-foreground hover:text-destructive flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newAdminNote}
                onChange={e => setNewAdminNote(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSaveAdminNote()}
                placeholder="أضف تعليمة جديدة..."
                className="flex-1 rounded-xl px-3 py-2 text-sm bg-background text-foreground border outline-none focus:border-primary placeholder:text-muted-foreground"
              />
              <button
                onClick={handleSaveAdminNote}
                disabled={!newAdminNote.trim()}
                className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40"
              >
                حفظ
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity">
            حفظ
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-secondary text-secondary-foreground font-medium text-sm hover:opacity-80 transition-opacity">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
