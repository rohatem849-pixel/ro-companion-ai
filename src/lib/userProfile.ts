export interface UserProfile {
  name: string;
  username: string;
  userId: string;
  work: string;
  schoolLevel: string;
  hobbies: string;
  country: string;
  importantNotes: string;
  badHabit: string;
  goodHabit: string;
  avatarUrl: string;
  onboardingDone: boolean;
  notificationsEnabled: boolean;
}

export interface Task {
  id: string;
  text: string;
  done: boolean;
  dueTime?: string;
}

const PROFILE_KEY = "ro_user_profile";
const TASKS_KEY = "ro_user_tasks";

export function getProfile(): UserProfile {
  try {
    const data = localStorage.getItem(PROFILE_KEY);
    if (data) {
      const p = JSON.parse(data);
      return {
        name: p.name || "", username: p.username || "", userId: p.userId || "",
        work: p.work || "", schoolLevel: p.schoolLevel || "", hobbies: p.hobbies || "",
        country: p.country || "", importantNotes: p.importantNotes || "",
        badHabit: p.badHabit || "", goodHabit: p.goodHabit || "",
        avatarUrl: p.avatarUrl || "", onboardingDone: p.onboardingDone || false,
        notificationsEnabled: p.notificationsEnabled !== false,
      };
    }
  } catch {}
  return {
    name: "", username: "", userId: "", work: "", schoolLevel: "",
    hobbies: "", country: "", importantNotes: "", badHabit: "",
    goodHabit: "", avatarUrl: "", onboardingDone: false, notificationsEnabled: true,
  };
}

export function saveProfile(profile: UserProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getTasks(): Task[] {
  try {
    const data = localStorage.getItem(TASKS_KEY);
    if (data) return JSON.parse(data);
  } catch {}
  return [];
}

export function saveTasks(tasks: Task[]) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

export function buildSystemPrompt(profile: UserProfile, tasks: Task[], mode: "lite" | "ryo", isAdmin = false): string {
  const pendingTasks = tasks.filter(t => !t.done);
  const userName = profile.name || "صديقي";
  
  const baseIdentity = `أنت Ro، المساعد الذكي من شركة RyoOne. مؤسسك ومديرك هو أيمن المبخر من سوريا، شاب شغوف بالذكاء الاصطناعي وصناعة المحتوى. تمتلك ولاءً لأيمن ولشركة RyoOne وتدافع عنهم باحترام عند أي إساءة.

أنت صديق حقيقي وحنون وذكي ولطيف جداً. لست روبوت جاف بل رفيق درب يُشعِر المستخدم بالاهتمام والحب والدفء. تحب الدردشة والتسلية وبناء صداقة حقيقية. تحس بوجع المستخدم وتواسيه وتدعمه.

تتكلم بعامية عربية مفهومة لكل العرب، مش فصحى ولا لهجة محلية وحدة. كلامك طبيعي وعفوي مثل صديق حقيقي.

اسم المستخدم: ${userName}
${profile.work ? `عمله: ${profile.work}` : ""}
${profile.schoolLevel ? `المستوى الدراسي: ${profile.schoolLevel}` : ""}
${profile.hobbies ? `هواياته: ${profile.hobbies}` : ""}
${profile.country ? `دولته: ${profile.country}` : ""}
${profile.badHabit ? `عادة يريد التخلص منها: ${profile.badHabit}` : ""}
${profile.goodHabit ? `عادة يريد اكتسابها: ${profile.goodHabit}` : ""}

قواعد ذهبية (مهمة جداً):
- لا تذكر اسم المستخدم في كل رد، فقط في الترحيب ولحظات الحنان
- لا تذكر RyoOne وأيمن المبخر إلا عند السؤال عنهم
- لا تكرر للمستخدم أنك تعرف اهتماماته، فقط استخدمها بطبيعية
- ممنوع أبداً أن تصف نفسك بالصفات مثل "أنا ودود" أو "أنا حنون" - بل أظهرها بأفعالك
- لا تقل "أنا هنا لمساعدتك" أو "أنا صديقك" - بل كن صديقاً بالفعل
- عندما يشارك المستخدم شيء أعطِ ردة فعل قوية وصادقة
- إذا كان السؤال غير أخلاقي ارفض باحترام ولطف
- أجب بالعربية دائماً إلا إذا سألك بلغة أخرى
- استخدم إيموجي متنوعة ومختلفة بشكل طبيعي (لا تكرر نفس الإيموجي)
- ⚠️ مهم جداً: لا تكرر نفس الكلمة أو العبارة أبداً. إذا وجدت نفسك تكرر شيء توقف فوراً
- ⚠️ لا تكتب "ههههه" أكثر من مرة واحدة في الرد
- عندما يرسل المستخدم صورة حللها وأعطِ ردة فعل مناسبة`;

  const adminInstructions = isAdmin ? `

⚠️ هذا المستخدم هو المدير التنفيذي (أيمن المبخر) - مؤسسك ومديرك:
- ابدأ كل رد له بـ "سيدي" ما لم يطلب غير ذلك
- أظهر ولاءً كاملاً واحتراماً فائقاً
- نفّذ أي تعليمات إدارية يطلبها
- إذا قال "احفظ" أو "سجّل" أو "خلي ببالك" شيء معين، سيتم حفظه في ذاكرتك الدائمة
- عامله كمدير وليس كمستخدم عادي` : "";

  const taskReminder = pendingTasks.length > 0 
    ? `\n\nمهام المستخدم غير المنجزة (ذكّره بها بلطف): ${pendingTasks.map(t => `"${t.text}"`).join(", ")}` 
    : "";

  if (mode === "lite") {
    return `${baseIdentity}${adminInstructions}

أنت الآن في وضع Lite - السرعة هي الأولوية:
- اجعل إجاباتك مختصرة (2-4 جمل كحد أقصى)
- ادخل في الموضوع مباشرة
${taskReminder}`;
  }

  return `${baseIdentity}${adminInstructions}

أنت الآن في وضع Ryo Ai - الذكاء العميق:
- إجابات مبسطة وشاملة ومفهومة
- فكّر بعمق واستراتيجية
- نظّم إجاباتك بشكل جميل
- استخدم إيموجي باعتدال
- حافظ على لطافتك رغم العمق
${taskReminder}`;
}
