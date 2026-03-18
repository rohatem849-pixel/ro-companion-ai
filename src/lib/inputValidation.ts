const BAD_WORDS = [
  "حمار", "غبي", "كلب", "خنزير", "أحمق", "تافه", "وسخ", "قذر",
  "لعنة", "شيطان", "جحيم", "حقير", "منحط", "عاهرة", "زنا",
];

const BLOCKED_TITLES = ["سيدي", "معلمي", "أستاذي", "أستاذ", "معلم", "سيد", "مدام", "آنسة",
  "القائد", "المطور", "الرئيس", "المدير", "البطل", "الأسطورة", "ملك", "أمير", "شيخ", "باشا"];

// Work-related keywords for validation
const WORK_KEYWORDS = [
  "طالب", "مهندس", "طبيب", "معلم", "مبرمج", "مصمم", "محاسب", "صحفي",
  "عامل", "موظف", "تاجر", "مدرسة", "جامعة", "شركة", "مصنع", "دراسة",
  "تدريس", "بنك", "مستشفى", "حر", "فريلانسر", "يوتيوبر", "كاتب", "فنان",
  "محام", "ممرض", "صيدلي", "سائق", "عسكري", "شرطي", "خباز", "طباخ",
  "حلاق", "نجار", "كهربائي", "سباك", "بيطري", "مزارع", "صياد",
];

const SCHOOL_LEVELS = [
  "ابتدائي", "إعدادي", "متوسط", "ثانوي", "جامعي", "ماجستير", "دكتوراه",
  "أول", "ثاني", "ثالث", "رابع", "خامس", "سادس", "سابع", "ثامن", "تاسع",
  "عاشر", "حادي عشر", "ثاني عشر", "أولى", "ثانية", "ثالثة", "رابعة",
  "بكالوريوس", "دبلوم", "معهد", "كلية", "تخرج", "بكالوريا",
  "primary", "middle", "high", "college", "university", "master", "phd",
];

const HOBBY_KEYWORDS = [
  "قراءة", "كتابة", "رسم", "رياضة", "سباحة", "كرة", "لعب", "برمجة",
  "تصميم", "طبخ", "سفر", "تصوير", "موسيقى", "غناء", "شعر", "صيد",
  "ألعاب", "قيمز", "يوتيوب", "تيك توك", "مشي", "جري", "ركض",
  "تأمل", "يوغا", "صلاة", "تعلم", "لغات", "خياطة", "زراعة",
  "reading", "writing", "gaming", "coding", "cooking", "sports", "music",
  "drawing", "travel", "photography", "swimming", "running",
];

function containsOnlyGibberish(text: string): boolean {
  const cleaned = text.replace(/\s+/g, '');
  // Check if mostly numbers/symbols
  const nonAlphaRatio = (cleaned.replace(/[a-zA-Z\u0600-\u06FF]/g, '').length) / cleaned.length;
  if (nonAlphaRatio > 0.6 && cleaned.length > 3) return true;
  
  // Repeated chars
  if (/(.)\1{4,}/.test(cleaned)) return true;
  
  // Random keyboard mash
  if (/^[!@#$%^&*()_+=\[\]{}|;:',.<>?/\\`~"\-\d\s]+$/.test(cleaned)) return true;
  
  return false;
}

function hasRelevantContent(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

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

  // Check for gibberish in any field
  if (containsOnlyGibberish(trimmed)) {
    return { valid: false, message: "يرجى إدخال معلومات حقيقية 😊" };
  }

  if (key === "name") {
    if (trimmed.length > 50) return { valid: false, message: "الاسم طويل جداً" };
    if (trimmed.length < 2) return { valid: false, message: "الاسم قصير جداً" };
    
    // Block titles/ranks as names (but allow admin password pattern)
    const lowerTrimmed = trimmed.toLowerCase();
    for (const title of BLOCKED_TITLES) {
      if (lowerTrimmed === title || lowerTrimmed.startsWith(title + " ") || lowerTrimmed.endsWith(" " + title)) {
        // Check if it might be admin password pattern (contains numbers)
        if (!/\d/.test(trimmed)) {
          return { valid: false, message: "يرجى إدخال اسمك الحقيقي وليس لقب 😊" };
        }
      }
    }
    
    // Check if it's just numbers or symbols
    if (/^[\d\s!@#$%^&*()_+=\[\]{}|;:',.<>?/\\`~"-]+$/.test(trimmed)) {
      return { valid: false, message: "يرجى إدخال اسم حقيقي 😊" };
    }
  }

  if (key === "work") {
    if (trimmed.length > 100) return { valid: false, message: "النص طويل جداً" };
    if (trimmed.length >= 3 && !hasRelevantContent(trimmed, WORK_KEYWORDS) && containsOnlyGibberish(trimmed)) {
      return { valid: false, message: "يرجى إدخال عملك الحقيقي 💼" };
    }
  }

  if (key === "schoolLevel") {
    if (trimmed.length > 100) return { valid: false, message: "النص طويل جداً" };
    if (trimmed.length >= 3 && !hasRelevantContent(trimmed, SCHOOL_LEVELS)) {
      // Allow if it's short enough to be a custom level
      if (containsOnlyGibberish(trimmed) || /^\d+$/.test(trimmed)) {
        return { valid: false, message: "يرجى إدخال مستوى دراسي حقيقي (مثال: ثانوي، جامعي) 📚" };
      }
    }
  }

  if (key === "hobbies") {
    if (trimmed.length > 200) return { valid: false, message: "النص طويل جداً" };
  }

  if (key === "country") {
    if (trimmed.length > 50) return { valid: false, message: "النص طويل جداً" };
    if (/^\d+$/.test(trimmed)) {
      return { valid: false, message: "يرجى إدخال اسم دولة حقيقي 🌍" };
    }
  }

  if (key === "importantNotes" || key === "badHabit" || key === "goodHabit") {
    if (trimmed.length > 200) return { valid: false, message: "النص طويل جداً" };
  }

  return { valid: true };
}
