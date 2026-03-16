const BAD_WORDS = [
  // Arabic bad words / inappropriate terms (basic list)
  "حمار", "غبي", "كلب", "خنزير", "أحمق", "تافه", "وسخ", "قذر",
  "لعنة", "شيطان", "جحيم",
];

const ALLOWED_TITLES = ["سيدي", "معلمي", "أستاذي", "أستاذ", "معلم", "سيد", "مدام", "آنسة"];

export function validateProfileField(key: string, value: string): { valid: boolean; message?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { valid: true }; // Empty is ok (optional)

  // Check for bad words in any field
  const lower = trimmed.toLowerCase();
  for (const word of BAD_WORDS) {
    if (lower.includes(word)) {
      return { valid: false, message: "يرجى استخدام كلمات مناسبة 🙏" };
    }
  }

  if (key === "name") {
    // Allow traditional names, titles, or empty
    if (trimmed.length > 50) return { valid: false, message: "الاسم طويل جداً" };
    // Check if it's just numbers or symbols
    if (/^[\d\s!@#$%^&*()_+=\[\]{}|;:',.<>?/\\`~"-]+$/.test(trimmed)) {
      return { valid: false, message: "يرجى إدخال اسم حقيقي 😊" };
    }
  }

  if (key === "schoolLevel" || key === "work") {
    if (trimmed.length > 100) return { valid: false, message: "النص طويل جداً" };
  }

  if (key === "hobbies") {
    if (trimmed.length > 200) return { valid: false, message: "النص طويل جداً" };
  }

  return { valid: true };
}
