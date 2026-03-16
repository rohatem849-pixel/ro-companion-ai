import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Task, saveTasks } from "@/lib/userProfile";

interface Props {
  tasks: Task[];
  onUpdate: (tasks: Task[]) => void;
  onClose: () => void;
}

export default function TasksPanel({ tasks, onUpdate, onClose }: Props) {
  const [newTask, setNewTask] = useState("");

  const addTask = () => {
    if (!newTask.trim()) return;
    const updated = [...tasks, { id: Date.now().toString(), text: newTask.trim(), done: false }];
    saveTasks(updated);
    onUpdate(updated);
    setNewTask("");
  };

  const toggleTask = (id: string) => {
    const updated = tasks.map(t => t.id === id ? { ...t, done: !t.done } : t);
    saveTasks(updated);
    onUpdate(updated);
  };

  const removeTask = (id: string) => {
    const updated = tasks.filter(t => t.id !== id);
    saveTasks(updated);
    onUpdate(updated);
  };

  return (
    <div className="p-4 space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">📋 مهامك</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addTask()}
          placeholder="أضف مهمة جديدة..."
          className="flex-1 text-sm rounded-xl px-3 py-2 bg-secondary text-foreground border outline-none focus:border-primary placeholder:text-muted-foreground"
        />
        <button onClick={addTask} className="p-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-1.5 max-h-60 overflow-y-auto">
        {tasks.map(t => (
          <div key={t.id} className="flex items-center gap-2 text-sm group">
            <button
              onClick={() => toggleTask(t.id)}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                t.done ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
              }`}
            >
              {t.done && "✓"}
            </button>
            <span className={`flex-1 ${t.done ? "line-through text-muted-foreground" : ""}`}>{t.text}</span>
            <button onClick={() => removeTask(t.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {tasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">لا مهام بعد ✨</p>}
      </div>
    </div>
  );
}
