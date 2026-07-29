import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  MoreHorizontal,
  Image,
  Palette,
  FileText,
  Database,
  Plus,
  ArrowLeft,
} from "lucide-react";

type Page = {
  id: string;
  ownerId: string;
  parentId: string | null;
  type: string;
  title: string;
  icon: string | null;
  cover: string | null;
  content: string;
  sortOrder: number;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PageChild = {
  id: string;
  title: string;
  icon: string | null;
  type: string;
};

const EMOJI_PALETTE = [
  "📝", "📄", "📋", "📌", "📎", "📎", "📊", "📈", "📉", "📅",
  "🎯", "💡", "🔥", "⭐", "❤️", "🚀", "💻", "🎨", "📷", "🎵",
  "📚", "🎓", "🏆", "🎮", "⚽", "🏀", "🏈", "🎾", "🎪", "🎭",
  "🌍", "🌈", "☀️", "🌙", "⚡", "🔮", "💎", "🎪", "🎉", "🎊",
  "📁", "📂", "🗂️", "🗃️", "📦", "🏷️", "🔖", "🔗", "📌", "📍",
  "✅", "❌", "⚠️", "ℹ️", "❓", "❗", "💬", "💭", "🗯️", "📣",
];

export default function PageEditor() {
  const params = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [children, setChildren] = useState<PageChild[]>([]);
  const [content, setContent] = useState("");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const pageId = params.pageId;

  useEffect(() => {
    if (!pageId) return;
    loadPage();
  }, [pageId]);

  const loadPage = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/pages/${pageId}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setPage(data.page);
        setTitle(data.page.title || "");
        setIcon(data.page.icon || null);
        setContent(data.page.content || "[]");
      } else if (res.status === 404) {
        navigate("/workspace");
      }
    } catch (err) {
      console.error("Failed to load page:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadChildren = useCallback(async () => {
    if (!pageId) return;
    try {
      const res = await fetch(`/api/pages?parentId=${pageId}&trashed=false`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setChildren(data.pages || []);
      }
    } catch (err) {
      console.error("Failed to load children:", err);
    }
  }, [pageId]);

  useEffect(() => {
    loadChildren();
  }, [loadChildren]);

  const savePage = async (updates: Partial<Page>) => {
    try {
      setSaving(true);
      const res = await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setPage(data.page);
      }
    } catch (err) {
      console.error("Failed to save page:", err);
    } finally {
      setSaving(false);
    }
  };

  const debouncedSave = (updates: Partial<Page>, delay = 800) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => savePage(updates), delay);
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    debouncedSave({ title: value });
  };

  const handleIconChange = (newIcon: string) => {
    setIcon(newIcon);
    setShowEmojiPicker(false);
    savePage({ icon: newIcon });
  };

  const createSubPage = async () => {
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          parentId: pageId,
          type: "page",
          title: "",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        loadChildren();
        navigate(`/workspace/page/${data.page.id}`);
      }
    } catch (err) {
      console.error("Failed to create sub-page:", err);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-12">
        <div className="space-y-6">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Page not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Cover image */}
      {page.cover && (
        <div className="relative h-48 w-full overflow-hidden">
          <img
            src={page.cover}
            alt="Cover"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
        </div>
      )}

      <div className="mx-auto max-w-3xl px-8 py-12">
        {/* Icon */}
        <div className="mb-2">
          {page.icon ? (
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="text-4xl hover:opacity-80"
            >
              {page.icon}
            </button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="text-muted-foreground"
            >
              <span className="mr-2">+</span>
              Add icon
            </Button>
          )}
        </div>

        {/* Emoji picker */}
        {showEmojiPicker && (
          <div className="mb-4 grid grid-cols-10 gap-1 rounded-lg border border-border bg-card p-2 shadow-lg">
            {EMOJI_PALETTE.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleIconChange(emoji)}
                className="rounded p-1 text-lg hover:bg-accent"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Title */}
        <input
          ref={titleInputRef}
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Untitled"
          className="mb-6 w-full border-none bg-transparent text-4xl font-bold text-foreground outline-none placeholder:text-muted-foreground"
        />

        {/* Editor area - simplified block editor */}
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              debouncedSave({ content: e.target.value });
            }}
            placeholder="Start writing, or press '/' for commands..."
            className="min-h-[400px] w-full resize-none border-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Sub-pages */}
        {children.length > 0 && (
          <div className="mt-12 border-t border-border pt-6">
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Sub-pages
            </h3>
            <div className="space-y-1">
              {children.map((child) => (
                <button
                  key={child.id}
                  onClick={() =>
                    navigate(
                      `/workspace/${child.type === "database" ? "database" : "page"}/${child.id}`
                    )
                  }
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm text-foreground hover:bg-accent"
                >
                  {child.icon && <span>{child.icon}</span>}
                  {child.type === "database" ? (
                    <Database className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="truncate">{child.title || "Untitled"}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Add sub-page button */}
        <button
          onClick={createSubPage}
          className="mt-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add sub-page
        </button>
      </div>
    </div>
  );
}
