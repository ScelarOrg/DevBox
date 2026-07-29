import { useState, useEffect, useCallback, useRef } from "react";
import { Outlet, useNavigate, useParams } from "react-router";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip } from "@/components/ui/tooltip";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronCollapsed,
  Plus,
  Search,
  Trash2,
  MoreHorizontal,
  FileText,
  Database,
  PanelLeftClose,
  PanelLeftOpen,
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

export default function WorkspaceLayout() {
  const navigate = useNavigate();
  const params = useParams();
  const [pages, setPages] = useState<Page[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const loadPages = useCallback(async () => {
    try {
      const res = await fetch("/api/pages?trashed=false", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setPages(data.pages || []);
      }
    } catch (err) {
      console.error("Failed to load pages:", err);
    }
  }, []);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  const createPage = async (parentId: string | null = null) => {
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          parentId,
          type: "page",
          title: "",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPages((prev) => [...prev, data.page]);
        if (parentId) {
          setExpandedIds((prev) => new Set([...prev, parentId]));
        }
        navigate(`/workspace/page/${data.page.id}`);
      }
    } catch (err) {
      console.error("Failed to create page:", err);
    }
  };

  const createDatabase = async (parentId: string | null = null) => {
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          parentId,
          type: "database",
          title: "",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPages((prev) => [...prev, data.page]);
        if (parentId) {
          setExpandedIds((prev) => new Set([...prev, parentId]));
        }
        navigate(`/workspace/database/${data.page.id}`);
      }
    } catch (err) {
      console.error("Failed to create database:", err);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const rootPages = pages.filter((p) => !p.parentId);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border bg-card transition-all duration-200 ${
          sidebarOpen ? "w-60" : "w-0"
        } overflow-hidden`}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium text-foreground">Pages</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => createPage()}
              title="New page"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => navigate("/workspace/search")}
              title="Search"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {rootPages.map((page) => (
              <PageTreeItem
                key={page.id}
                page={page}
                pages={pages}
                expandedIds={expandedIds}
                onToggle={toggleExpanded}
                onNavigate={(id, type) =>
                  navigate(`/workspace/${type === "database" ? "database" : "page"}/${id}`)
                }
                onCreatePage={createPage}
                onCreateDatabase={createDatabase}
              />
            ))}
          </div>
        </ScrollArea>

        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => navigate("/workspace/trash")}
          >
            <Trash2 className="h-4 w-4" />
            <span>Trash</span>
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-10 items-center border-b border-border px-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function PageTreeItem({
  page,
  pages,
  expandedIds,
  onToggle,
  onNavigate,
  onCreatePage,
  onCreateDatabase,
}: {
  page: Page;
  pages: Page[];
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onNavigate: (id: string, type: string) => void;
  onCreatePage: (parentId: string) => void;
  onCreateDatabase: (parentId: string) => void;
}) {
  const children = pages.filter((p) => p.parentId === page.id);
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(page.id);

  return (
    <div>
      <div className="group flex items-center gap-1 rounded px-2 py-1 hover:bg-accent">
        {hasChildren ? (
          <button
            onClick={() => onToggle(page.id)}
            className="flex h-4 w-4 shrink-0 items-center justify-center"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronCollapsed className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}

        <button
          onClick={() => onNavigate(page.id, page.type)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-foreground hover:text-foreground"
        >
          {page.icon && <span>{page.icon}</span>}
          {!page.icon && (
            page.type === "database" ? (
              <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            )
          )}
          <span className="truncate">
            {page.title || "Untitled"}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onCreatePage(page.id)}
            title="Add sub-page"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div className="ml-4">
          {children.map((child) => (
            <PageTreeItem
              key={child.id}
              page={child}
              pages={pages}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onNavigate={onNavigate}
              onCreatePage={onCreatePage}
              onCreateDatabase={onCreateDatabase}
            />
          ))}
        </div>
      )}
    </div>
  );
}
