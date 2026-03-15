import { useState } from "react";
import { UserProfile, saveProfile } from "@/lib/userProfile";

interface Props {
  profile: UserProfile;
  onUpdate: (p: UserProfile) => void;
  onClose: () => void;
}

export default function SettingsPanel({ profile, onUpdate, onClose }: Props) {
  const [local, setLocal] = useState({ ...profile });

  const save = () => {
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
        <h2 className="text-lg font-bold mb-4">⚙️ إعدادات الملف الشخصي</h2>
        <div className="space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{f.label}</label>
              <input
                value={(local as any)[f.key] || ""}
                onChange={e => setLocal(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full rounded-xl px-3 py-2.5 text-sm bg-secondary text-foreground border outline-none focus:border-primary placeholder:text-muted-foreground"
              />
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
