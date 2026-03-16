import { useState } from "react";
import { X } from "lucide-react";
import { UserProfile, saveProfile } from "@/lib/userProfile";
import { validateProfileField } from "@/lib/inputValidation";

interface Props {
  profile: UserProfile;
  onUpdate: (p: UserProfile) => void;
  onClose: () => void;
}

export default function SettingsPanel({ profile, onUpdate, onClose }: Props) {
  const [local, setLocal] = useState({ ...profile });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (key: string, value: string) => {
    setLocal(prev => ({ ...prev, [key]: value }));
    const validation = validateProfileField(key, value);
    if (!validation.valid) {
      setErrors(prev => ({ ...prev, [key]: validation.message || "" }));
    } else {
      setErrors(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  const save = () => {
    // Validate all
    let hasError = false;
    const newErrors: Record<string, string> = {};
    for (const f of fields) {
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
    saveProfile(local);
    onUpdate(local);
    onClose();
  };

  const fields = [
    { key: "name", label: "الاسم", placeholder: "اسمك" },
    { key: "work", label: "العمل", placeholder: "عملك" },
    { key: "schoolLevel", label: "المستوى الدراسي", placeholder: "مستواك الدراسي" },
    { key: "hobbies", label: "الهوايات", placeholder: "هواياتك" },
    { key: "country", label: "الدولة", placeholder: "دولتك" },
    { key: "importantNotes", label: "ملاحظات مهمة", placeholder: "أشياء تريد أن يتذكرها Ro" },
    { key: "badHabit", label: "عادة تريد التخلص منها", placeholder: "عادة سيئة" },
    { key: "goodHabit", label: "عادة تريد اكتسابها", placeholder: "عادة جيدة" },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "hsla(var(--background) / 0.8)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-md bg-card rounded-3xl p-6 shadow-2xl border max-h-[85vh] overflow-y-auto" dir="rtl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">⚙️ إعدادات الملف الشخصي</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <X className="w-5 h-5" />
          </button>
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
