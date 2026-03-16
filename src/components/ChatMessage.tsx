import { memo, useState } from "react";
import { Copy, Check, RefreshCw, Globe } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { SearchResult } from "@/lib/webSearch";

interface Props {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  searchResults?: SearchResult[];
  isSearching?: boolean;
}

function ChatMessage({ role, content, isStreaming, onRegenerate, searchResults, isSearching }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (role === "user") {
    return (
      <div className="flex justify-end mb-4 animate-fade-in">
        <div className="max-w-[85%] md:max-w-[70%] rounded-2xl rounded-tl-sm px-4 py-3 bg-user-bubble text-user-bubble-foreground text-sm leading-relaxed">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 animate-fade-in group">
      {isSearching && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Globe className="w-3.5 h-3.5 animate-spin" />
          <span>جاري البحث...</span>
        </div>
      )}
      <div className={`text-sm leading-[1.9] ro-markdown ${isStreaming ? "streaming-cursor" : ""}`}>
        <ReactMarkdown>{content || " "}</ReactMarkdown>
      </div>
      {/* Search sources */}
      {searchResults && searchResults.length > 0 && !isStreaming && (
        <div className="mt-3 flex flex-wrap gap-2">
          {searchResults.map((r, i) => (
            <a
              key={i}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-xl bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all border"
            >
              <Globe className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-[140px]">{r.source}</span>
            </a>
          ))}
        </div>
      )}
      {!isStreaming && content && (
        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            title="نسخ"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              title="إعادة صياغة"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(ChatMessage);
