import { memo, useState } from "react";
import { Copy, Check, Globe, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { SearchResult } from "@/lib/webSearch";

interface Props {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  searchResults?: SearchResult[];
  isSearching?: boolean;
  mode?: "lite" | "ryo";
  imagePreview?: string;
  onPublishToBrick?: () => void;
}

function ChatMessage({ role, content, isStreaming, onRegenerate, searchResults, isSearching, mode = "ryo", imagePreview, onPublishToBrick }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (role === "user") {
    return (
      <div className="flex justify-end mb-3 animate-fade-in">
        <div className="max-w-[85%] md:max-w-[70%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed" style={{ background: "hsl(var(--user-bubble))", color: "hsl(var(--user-bubble-foreground))" }}>
          {imagePreview && (
            <img src={imagePreview} alt="مرفق" className="w-40 h-40 object-cover rounded-xl mb-2" />
          )}
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 animate-fade-in group">
      {/* Searching indicator */}
      {isSearching && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Globe className="w-3.5 h-3.5 animate-spin" />
          <span>جاري البحث في الويب...</span>
        </div>
      )}

      {/* Waiting animation - three dots that morph to circle */}
      {isStreaming && !content && !isSearching && (
        <div className="flex items-center gap-1.5 mb-2 h-6">
          <div className="ro-loading-dot" style={{ animationDelay: "0ms" }} />
          <div className="ro-loading-dot" style={{ animationDelay: "150ms" }} />
          <div className="ro-loading-dot" style={{ animationDelay: "300ms" }} />
        </div>
      )}

      <div className={`text-sm leading-[1.9] ro-markdown ${isStreaming ? "streaming-cursor" : ""}`}>
        <ReactMarkdown>{content || " "}</ReactMarkdown>
      </div>

      {/* Search sources */}
      {searchResults && searchResults.length > 0 && !isStreaming && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[11px] text-muted-foreground font-medium">📎 المصادر:</p>
          <div className="flex flex-wrap gap-1.5">
            {searchResults.map((r, i) => (
              <a
                key={i}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all border"
              >
                <Globe className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate max-w-[120px]">{r.source}</span>
                <ExternalLink className="w-2 h-2 flex-shrink-0 opacity-50" />
              </a>
            ))}
          </div>
        </div>
      )}

      {!isStreaming && content && (
        <div className="flex gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={handleCopy} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all" title="نسخ">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {onPublishToBrick && (
            <button onClick={onPublishToBrick} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all" title="نشر في The Brick">
              <span className="text-[11px]">🧱</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(ChatMessage);
