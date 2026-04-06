import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Heart, ThumbsDown, MessageCircle, Send, Image as ImageIcon,
  Flag, Share2, Trash2, RefreshCw, Camera, ChevronDown, ChevronUp, Video
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UserProfile } from "@/lib/userProfile";

interface Post {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  likes_count: number;
  dislikes_count: number;
  comments_count: number;
  created_at: string;
  expires_at: string;
  username?: string;
  avatar_url?: string | null;
  userLiked?: boolean;
  userDisliked?: boolean;
  isFollowing?: boolean;
}

interface Comment {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  likes_count: number;
  username?: string;
  avatar_url?: string | null;
  userLiked?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  isAdmin: boolean;
  adminPassword: string;
  initialContent?: string;
}

export default function TheBrick({ isOpen, onClose, profile, isAdmin, adminPassword, initialContent }: Props) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(!!initialContent);
  const [composeText, setComposeText] = useState(initialContent || "");
  const [composeImage, setComposeImage] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: string; id: string } | null>(null);
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) loadPosts();
  }, [isOpen]);

  useEffect(() => {
    if (initialContent) {
      setComposeText(initialContent);
      setShowCompose(true);
    }
  }, [initialContent]);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const { data: postsData } = await supabase
        .from("posts")
        .select("*")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(50);

      if (postsData) {
        const userIds = [...new Set(postsData.map(p => p.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        let userLikes: any[] = [];
        let userFollows: any[] = [];
        if (profile.userId) {
          const { data: likes } = await supabase
            .from("post_likes")
            .select("post_id, is_like")
            .eq("user_id", profile.userId);
          userLikes = likes || [];

          const { data: follows } = await supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", profile.userId);
          userFollows = follows || [];
        }

        const likeMap = new Map(userLikes.map(l => [l.post_id, l.is_like]));
        const followSet = new Set(userFollows.map(f => f.following_id));

        const enriched = postsData.map(p => ({
          ...p,
          username: profileMap.get(p.user_id)?.username || "مجهول",
          avatar_url: profileMap.get(p.user_id)?.avatar_url,
          userLiked: likeMap.get(p.id) === true,
          userDisliked: likeMap.get(p.id) === false,
          isFollowing: followSet.has(p.user_id),
        }));

        enriched.sort((a, b) => {
          if (a.isFollowing && !b.isFollowing) return -1;
          if (!a.isFollowing && b.isFollowing) return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        setPosts(enriched);
      }
    } catch (e) {
      console.error("Load posts error:", e);
    }
    setLoading(false);
  };

  const handlePost = async () => {
    if (!composeText.trim() && !composeImage) return;
    if (!profile.userId) return;
    setPosting(true);
    try {
      let imageUrl = null;
      if (composeImage) {
        const isVideo = composeImage.startsWith("data:video");
        const base64Data = composeImage.split(",")[1];
        const ext = isVideo ? "mp4" : composeImage.includes("png") ? "png" : "jpg";
        const fileName = `posts/${profile.userId}/${Date.now()}.${ext}`;
        const { data: uploadData } = await supabase.storage
          .from("uploads")
          .upload(fileName, Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)), {
            contentType: isVideo ? "video/mp4" : `image/${ext}`,
          });
        if (uploadData) {
          const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);
          imageUrl = urlData.publicUrl;
        }
      }

      await supabase.from("posts").insert({
        user_id: profile.userId,
        content: composeText.trim(),
        image_url: imageUrl,
      });

      setComposeText("");
      setComposeImage(null);
      setShowCompose(false);
      await loadPosts();
    } catch (e) {
      console.error("Post error:", e);
    }
    setPosting(false);
  };

  // Optimistic like/dislike - no page reload, proper toggle
  const handleLike = async (postId: string, isLike: boolean) => {
    if (!profile.userId) return;
    const postIndex = posts.findIndex(p => p.id === postId);
    if (postIndex === -1) return;
    const post = posts[postIndex];

    const alreadySame = isLike ? post.userLiked : post.userDisliked;
    const hadOpposite = isLike ? post.userDisliked : post.userLiked;

    let newLikes = post.likes_count;
    let newDislikes = post.dislikes_count;
    let newUserLiked = post.userLiked;
    let newUserDisliked = post.userDisliked;

    if (alreadySame) {
      // Remove same reaction (toggle off)
      if (isLike) { newLikes = Math.max(0, newLikes - 1); newUserLiked = false; }
      else { newDislikes = Math.max(0, newDislikes - 1); newUserDisliked = false; }
    } else {
      // Add new reaction
      if (hadOpposite) {
        // Remove opposite first
        if (isLike) { newDislikes = Math.max(0, newDislikes - 1); newUserDisliked = false; }
        else { newLikes = Math.max(0, newLikes - 1); newUserLiked = false; }
      }
      if (isLike) { newLikes++; newUserLiked = true; }
      else { newDislikes++; newUserDisliked = true; }
    }

    const updatedPosts = [...posts];
    updatedPosts[postIndex] = { ...post, likes_count: newLikes, dislikes_count: newDislikes, userLiked: newUserLiked, userDisliked: newUserDisliked };
    setPosts(updatedPosts);

    // DB update
    try {
      await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", profile.userId);
      if (!alreadySame) {
        await supabase.from("post_likes").insert({ post_id: postId, user_id: profile.userId, is_like: isLike });
      }
      await supabase.from("posts").update({ likes_count: newLikes, dislikes_count: newDislikes }).eq("id", postId);
    } catch (e) {
      console.error("Like error:", e);
    }
  };

  const handleFollow = async (userId: string) => {
    if (!profile.userId || userId === profile.userId) return;
    const isFollowing = posts.some(p => p.user_id === userId && p.isFollowing);

    // Optimistic
    setPosts(prev => prev.map(p =>
      p.user_id === userId ? { ...p, isFollowing: !isFollowing } : p
    ));

    try {
      if (isFollowing) {
        await supabase.from("follows").delete().eq("follower_id", profile.userId).eq("following_id", userId);
      } else {
        await supabase.from("follows").insert({ follower_id: profile.userId, following_id: userId });
      }
    } catch (e) {
      console.error("Follow error:", e);
    }
  };

  const handleReport = async (postId: string) => {
    setConfirmAction({ type: "report", id: postId });
  };

  const handleDelete = async (postId: string) => {
    setConfirmAction({ type: "delete", id: postId });
  };

  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, id } = confirmAction;

    if (type === "report" && profile.userId) {
      const { data: existing } = await supabase
        .from("reports")
        .select("id")
        .eq("post_id", id)
        .eq("reporter_id", profile.userId)
        .maybeSingle();
      if (!existing) {
        await supabase.from("reports").insert({ post_id: id, reporter_id: profile.userId, reason: "user_report" });
        const { count } = await supabase.from("reports").select("id", { count: "exact" }).eq("post_id", id);
        if (count && count >= 8) {
          await supabase.from("posts").delete().eq("id", id);
          setPosts(prev => prev.filter(p => p.id !== id));
        }
      }
    } else if (type === "delete") {
      await supabase.from("posts").delete().eq("id", id);
      setPosts(prev => prev.filter(p => p.id !== id));
    }

    setConfirmAction(null);
  };

  const copyLink = (postId: string) => {
    const url = `${window.location.origin}/?post=${postId}`;
    navigator.clipboard.writeText(url);
  };

  const loadComments = async (postId: string) => {
    const { data } = await supabase
      .from("post_comments")
      .select("*")
      .eq("post_id", postId)
      .order("likes_count", { ascending: false });

    if (data) {
      const userIds = [...new Set(data.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", userIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      let userCommentLikes: any[] = [];
      if (profile.userId) {
        const { data: likes } = await supabase
          .from("comment_likes")
          .select("comment_id")
          .eq("user_id", profile.userId);
        userCommentLikes = likes || [];
      }
      const likedSet = new Set(userCommentLikes.map(l => l.comment_id));

      setComments(data.map(c => ({
        ...c,
        username: profileMap.get(c.user_id)?.username || "مجهول",
        avatar_url: profileMap.get(c.user_id)?.avatar_url,
        userLiked: likedSet.has(c.id),
      })));
    }
  };

  const submitComment = async () => {
    if (!commentText.trim() || !selectedPost || !profile.userId) return;
    const newComment: Comment = {
      id: crypto.randomUUID(),
      content: commentText.trim(),
      user_id: profile.userId,
      created_at: new Date().toISOString(),
      likes_count: 0,
      username: profile.username,
      avatar_url: profile.avatarUrl || null,
      userLiked: false,
    };
    setComments(prev => [...prev, newComment]);
    setCommentText("");

    // Update post comments count optimistically
    setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, comments_count: p.comments_count + 1 } : p));
    setSelectedPost(prev => prev ? { ...prev, comments_count: prev.comments_count + 1 } : prev);

    try {
      await supabase.from("post_comments").insert({
        post_id: selectedPost.id,
        user_id: profile.userId,
        content: newComment.content,
      });
      await supabase.from("posts").update({
        comments_count: (selectedPost.comments_count || 0) + 1,
      }).eq("id", selectedPost.id);
    } catch (e) {
      console.error("Comment error:", e);
    }
  };

  const likeComment = async (commentId: string) => {
    if (!profile.userId) return;
    const ci = comments.findIndex(c => c.id === commentId);
    if (ci === -1) return;
    const comment = comments[ci];

    // Optimistic
    const updated = [...comments];
    updated[ci] = {
      ...comment,
      userLiked: !comment.userLiked,
      likes_count: comment.userLiked ? Math.max(0, comment.likes_count - 1) : comment.likes_count + 1,
    };
    setComments(updated);

    try {
      if (comment.userLiked) {
        await supabase.from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", profile.userId);
        await supabase.from("post_comments").update({ likes_count: Math.max(0, comment.likes_count - 1) }).eq("id", commentId);
      } else {
        await supabase.from("comment_likes").insert({ comment_id: commentId, user_id: profile.userId });
        await supabase.from("post_comments").update({ likes_count: comment.likes_count + 1 }).eq("id", commentId);
      }
    } catch (e) {
      console.error("Comment like error:", e);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setComposeImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Check duration < 35s
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      if (video.duration > 35) {
        alert("الفيديو يجب أن يكون أقل من 35 ثانية");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setComposeImage(reader.result as string);
      reader.readAsDataURL(file);
    };
    video.src = URL.createObjectURL(file);
    e.target.value = "";
  };

  const toggleExpand = (postId: string) => {
    setExpandedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `${mins} د`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} س`;
    return `${Math.floor(hours / 24)} ي`;
  };

  const isLongContent = (content: string) => content.length > 200;

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-background flex flex-col"
      dir="rtl"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧱</span>
          <span className="font-bold text-sm">The Brick</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadPosts} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all" title="تحديث">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCompose(true)}
            className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all"
          >
            + نشر
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Posts feed */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto py-3 px-3 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="flex gap-1.5">
                <div className="ro-loading-dot" style={{ animationDelay: "0ms" }} />
                <div className="ro-loading-dot" style={{ animationDelay: "150ms" }} />
                <div className="ro-loading-dot" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl mb-3 block">🧱</span>
              <p className="text-sm text-muted-foreground">لا منشورات حالياً</p>
              <p className="text-xs text-muted-foreground mt-1">كن أول من ينشر!</p>
            </div>
          ) : (
            posts.map(post => (
              <motion.div
                key={post.id}
                layout
                className="bg-card rounded-2xl border p-4 space-y-3"
              >
                {/* Post header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
                      {post.avatar_url ? (
                        <img src={post.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm">🧱</span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold">@{post.username}</p>
                      <p className="text-[10px] text-muted-foreground">{timeAgo(post.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {post.user_id !== profile.userId && (
                      <button
                        onClick={() => handleFollow(post.user_id)}
                        className={`text-[10px] px-2 py-1 rounded-lg font-medium transition-all ${
                          post.isFollowing
                            ? "bg-secondary text-muted-foreground"
                            : "bg-primary/10 text-primary hover:bg-primary/20"
                        }`}
                      >
                        {post.isFollowing ? "متابَع" : "متابعة"}
                      </button>
                    )}
                    {(isAdmin || post.user_id === profile.userId) && (
                      <button onClick={() => handleDelete(post.id)} className="p-1 rounded-lg text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Content with show more */}
                {post.content && (
                  <div>
                    <p className="text-sm leading-relaxed">
                      {isLongContent(post.content) && !expandedPosts.has(post.id)
                        ? post.content.slice(0, 200) + "..."
                        : post.content}
                    </p>
                    {isLongContent(post.content) && (
                      <button
                        onClick={() => toggleExpand(post.id)}
                        className="text-xs text-primary mt-1 flex items-center gap-0.5"
                      >
                        {expandedPosts.has(post.id) ? (
                          <>عرض أقل <ChevronUp className="w-3 h-3" /></>
                        ) : (
                          <>عرض المزيد <ChevronDown className="w-3 h-3" /></>
                        )}
                      </button>
                    )}
                  </div>
                )}
                {post.image_url && (
                  post.image_url.includes(".mp4") ? (
                    <video
                      src={post.image_url}
                      controls
                      className="w-full rounded-xl max-h-80"
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={post.image_url}
                      alt=""
                      className="w-full rounded-xl max-h-80 object-cover cursor-pointer"
                      onClick={() => setViewingImage(post.image_url)}
                    />
                  )
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleLike(post.id, true)}
                      className={`flex items-center gap-1 text-xs transition-all ${post.userLiked ? "text-red-500" : "text-muted-foreground hover:text-red-500"}`}
                    >
                      <Heart className={`w-4 h-4 ${post.userLiked ? "fill-current" : ""}`} />
                      {post.likes_count > 0 && <span>{post.likes_count}</span>}
                    </button>
                    <button
                      onClick={() => handleLike(post.id, false)}
                      className={`flex items-center gap-1 text-xs transition-all ${post.userDisliked ? "text-blue-500" : "text-muted-foreground hover:text-blue-500"}`}
                    >
                      <ThumbsDown className={`w-4 h-4 ${post.userDisliked ? "fill-current" : ""}`} />
                      {post.dislikes_count > 0 && <span>{post.dislikes_count}</span>}
                    </button>
                    <button
                      onClick={() => { setSelectedPost(post); loadComments(post.id); }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-all"
                    >
                      <MessageCircle className="w-4 h-4" />
                      {post.comments_count > 0 && <span>{post.comments_count}</span>}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => copyLink(post.id)} className="text-muted-foreground hover:text-foreground transition-all">
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    {post.user_id !== profile.userId && (
                      <button onClick={() => handleReport(post.id)} className="text-muted-foreground hover:text-orange-500 transition-all">
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expiry */}
                <p className="text-[9px] text-muted-foreground/50">
                  ينتهي خلال {Math.max(0, Math.floor((new Date(post.expires_at).getTime() - Date.now()) / 3600000))} ساعة
                </p>
              </motion.div>
            ))
          )}
        </div>
      </main>

      {/* Compose modal */}
      <AnimatePresence>
        {showCompose && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] flex items-end justify-center"
            style={{ background: "hsla(var(--background) / 0.6)", backdropFilter: "blur(4px)" }}
          >
            <motion.div
              initial={{ y: 200 }}
              animate={{ y: 0 }}
              exit={{ y: 200 }}
              className="w-full max-w-lg bg-card rounded-t-3xl border-t p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">منشور جديد 🧱</h3>
                <button onClick={() => { setShowCompose(false); setComposeText(""); setComposeImage(null); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <textarea
                value={composeText}
                onChange={e => setComposeText(e.target.value)}
                placeholder="اكتب شيئاً..."
                className="w-full bg-secondary rounded-xl p-3 text-sm outline-none resize-none h-24 text-foreground placeholder:text-muted-foreground"
              />
              {composeImage && (
                <div className="relative inline-block">
                  {composeImage.startsWith("data:video") ? (
                    <video src={composeImage} className="w-24 h-24 rounded-xl object-cover" />
                  ) : (
                    <img src={composeImage} alt="" className="w-24 h-24 rounded-xl object-cover" />
                  )}
                  <button onClick={() => setComposeImage(null)} className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">📌 المنشور يُحذف تلقائياً بعد 48 ساعة</p>
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageSelect} />
                  <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoSelect} />
                  <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary" title="صورة">
                    <ImageIcon className="w-5 h-5" />
                  </button>
                  <button onClick={() => cameraInputRef.current?.click()} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary" title="كاميرا">
                    <Camera className="w-5 h-5" />
                  </button>
                  <button onClick={() => videoInputRef.current?.click()} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary" title="فيديو (أقل من 35 ثانية)">
                    <Video className="w-5 h-5" />
                  </button>
                </div>
                <button
                  onClick={handlePost}
                  disabled={posting || (!composeText.trim() && !composeImage)}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-all"
                >
                  {posting ? "جاري النشر..." : "نشر"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comments modal */}
      <AnimatePresence>
        {selectedPost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[135] flex items-end justify-center"
            style={{ background: "hsla(var(--background) / 0.6)", backdropFilter: "blur(4px)" }}
          >
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              className="w-full max-w-lg bg-card rounded-t-3xl border-t max-h-[70vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-sm font-bold">التعليقات ({selectedPost.comments_count})</h3>
                <button onClick={() => setSelectedPost(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {comments.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">لا تعليقات بعد</p>
                ) : (
                  comments.map(c => (
                    <div key={c.id} className="flex gap-2 p-2 rounded-xl hover:bg-secondary/50 transition-all">
                      <div className="w-7 h-7 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                        {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : <span className="text-[10px]">🧱</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[11px] font-semibold">@{c.username}</p>
                          <p className="text-[9px] text-muted-foreground">{timeAgo(c.created_at)}</p>
                        </div>
                        <p className="text-xs leading-relaxed mt-0.5">{c.content}</p>
                        <button
                          onClick={() => likeComment(c.id)}
                          className={`flex items-center gap-1 text-[10px] mt-1 transition-all ${c.userLiked ? "text-red-500" : "text-muted-foreground hover:text-red-500"}`}
                        >
                          <Heart className={`w-3 h-3 ${c.userLiked ? "fill-current" : ""}`} />
                          {c.likes_count > 0 && <span>{c.likes_count}</span>}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="p-3 border-t flex gap-2">
                <input
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && submitComment()}
                  placeholder="اكتب تعليقاً..."
                  className="flex-1 bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none text-foreground placeholder:text-muted-foreground"
                />
                <button
                  onClick={submitComment}
                  disabled={!commentText.trim()}
                  className="p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image viewer */}
      <AnimatePresence>
        {viewingImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] bg-black flex items-center justify-center"
            onClick={() => setViewingImage(null)}
          >
            <button className="absolute top-4 right-4 p-2 rounded-full bg-white/20 text-white" onClick={() => setViewingImage(null)}>
              <X className="w-5 h-5" />
            </button>
            <img src={viewingImage} alt="" className="max-w-full max-h-full object-contain" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm dialog */}
      <AnimatePresence>
        {confirmAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[145] flex items-center justify-center p-4"
            style={{ background: "hsla(var(--background) / 0.7)", backdropFilter: "blur(4px)" }}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-card rounded-2xl border p-5 max-w-xs w-full shadow-2xl text-center space-y-4"
            >
              <p className="text-sm font-bold">
                {confirmAction.type === "report" ? "هل أنت متأكد من الإبلاغ؟ 🚩" : "هل أنت متأكد من الحذف؟ 🗑️"}
              </p>
              <p className="text-xs text-muted-foreground">
                {confirmAction.type === "report" ? "سيتم إبلاغ الإدارة عن هذا المنشور" : "لا يمكن التراجع عن هذا الإجراء"}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={executeConfirmAction}
                  className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium"
                >
                  نعم
                </button>
                <button
                  onClick={() => setConfirmAction(null)}
                  className="flex-1 py-2 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
