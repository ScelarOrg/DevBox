import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileText, Database, Search } from "lucide-react";

type Page = {
  id: string;
  title: string;
  icon: string | null;
  type: string;
  updatedAt: string;
};

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Page[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const search = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/pages?search=${encodeURIComponent(query)}&trashed=false`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data.pages || []);
        }
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setLoading(false);
      }
    };

    const timeout = setTimeout(search, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <div className="mb-6">
        <h1 className="mb-4 text-2xl font-bold text-foreground">Search</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages..."
            className="pl-9"
          />
        </div>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground">Searching...</div>
      )}

      {!loading && query.length >= 2 && results.length === 0 && (
        <div className="text-sm text-muted-foreground">No results found</div>
      )}

      <div className="space-y-1">
        {results.map((page) => (
          <button
            key={page.id}
            onClick={() =>
              navigate(
                `/workspace/${page.type === "database" ? "database" : "page"}/${page.id}`
              )
            }
            className="flex w-full items-center gap-3 rounded px-3 py-2 text-left hover:bg-accent"
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
                {page.type === "database" ? "Database" : "Page"} ·{" "}
                {new Date(page.updatedAt).toLocaleDateString()}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
