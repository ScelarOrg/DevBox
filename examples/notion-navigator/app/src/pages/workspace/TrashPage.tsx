import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { FileText, Database, Trash2, RotateCcw } from "lucide-react";

type Page = {
  id: string;
  title: string;
  icon: string | null;
  type: string;
  trashedAt: string | null;
  updatedAt: string;
};

export default function TrashPage() {
  const navigate = useNavigate();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTrashedPages = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/pages?trashed=true", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setPages(data.pages || []);
      }
    } catch (err) {
      console.error("Failed to load trashed pages:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrashedPages();
  }, [loadTrashedPages]);

  const restorePage = async (pageId: string) => {
    try {
      const res = await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ trashedAt: null }),
      });

      if (res.ok) {
        setPages(pages.filter((p) => p.id !== pageId));
      }
    } catch (err) {
      console.error("Failed to restore page:", err);
    }
  };

  const deleteForever = async (pageId: string) => {
    try {
      const res = await fetch(`/api/pages/${pageId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        setPages(pages.filter((p) => p.id !== pageId));
      }
    } catch (err) {
      console.error("Failed to delete page:", err);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Trash</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pages moved to trash will be permanently deleted after 30 days
        </p>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}

      {!loading && pages.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Trash2 className="mx-auto mb-3 h-8 w-8 opacity-50" />
          No pages in trash
        </div>
      )}

      <div className="space-y-1">
        {pages.map((page) => (
          <div
            key={page.id}
            className="flex items-center gap-3 rounded border border-border px-3 py-2"
          >
            {page.icon && <span className="text-lg">{page.icon}</span>}
            {page.type === "database" ? (
              <Database className="h-5 w-5 shrink-0 text-muted-foreground" />
            ) : (
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {page.title || "Untitled"}
              </div>
              <div className="text-xs text-muted-foreground">
                Deleted{" "}
                {page.trashedAt
                  ? new Date(page.trashedAt).toLocaleDateString()
                  : "recently"}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => restorePage(page.id)}
                className="gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                Restore
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteForever(page.id)}
                className="gap-1 text-destructive-foreground"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
