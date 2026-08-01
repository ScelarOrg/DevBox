import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Database,
  FileText,
  ArrowLeft,
  Filter,
  Columns,
  X,
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

type Property = {
  id: string;
  databaseId: string;
  name: string;
  type: string;
  options: string;
  sortOrder: number;
};

type Row = {
  id: string;
  databaseId: string;
  title: string;
  properties: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type Option = {
  id: string;
  label: string;
  color: string;
};

const PROPERTY_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "multi_select", label: "Multi-select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
];

const OPTION_COLORS = [
  "blue", "green", "red", "yellow", "purple", "orange", "gray", "pink",
];

export default function DatabaseView() {
  const params = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState<Page | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    propertyId: string;
  } | null>(null);
  const [showPropertyMenu, setShowPropertyMenu] = useState(false);
  const [newProperty, setNewProperty] = useState({ name: "", type: "text" });
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<
    Array<{ propertyId: string; value: string }>
  >([]);
  const pageId = params.pageId;

  useEffect(() => {
    if (!pageId) return;
    loadDatabase();
  }, [pageId]);

  const loadDatabase = async () => {
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
        setProperties(data.page.properties || []);
        setRows(data.page.rows || []);
      } else if (res.status === 404) {
        navigate("/workspace");
      }
    } catch (err) {
      console.error("Failed to load database:", err);
    } finally {
      setLoading(false);
    }
  };

  const saveTitle = async () => {
    try {
      const res = await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const data = await res.json();
        setPage(data.page);
      }
    } catch (err) {
      console.error("Failed to save title:", err);
    }
  };

  const addProperty = async () => {
    if (!newProperty.name.trim()) return;

    try {
      const newProp: Property = {
        id: crypto.randomUUID(),
        databaseId: pageId!,
        name: newProperty.name,
        type: newProperty.type,
        options:
          newProperty.type === "select" || newProperty.type === "multi_select"
            ? JSON.stringify([])
            : "{}",
        sortOrder: properties.length,
      };

      const res = await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          properties: [...properties, newProp],
        }),
      });

      if (res.ok) {
        setProperties([...properties, newProp]);
        setNewProperty({ name: "", type: "text" });
        setShowPropertyMenu(false);
      }
    } catch (err) {
      console.error("Failed to add property:", err);
    }
  };

  const addRow = async () => {
    try {
      const res = await fetch(`/api/pages/${pageId}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: "",
          properties: {},
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRows([...rows, data.row]);
      }
    } catch (err) {
      console.error("Failed to add row:", err);
    }
  };

  const updateCell = async (
    rowId: string,
    propertyId: string,
    value: string
  ) => {
    try {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;

      const props = JSON.parse(row.properties || "{}");
      props[propertyId] = value;

      const res = await fetch(`/api/pages/${pageId}/rows/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ properties: props }),
      });

      if (res.ok) {
        setRows(
          rows.map((r) =>
            r.id === rowId ? { ...r, properties: JSON.stringify(props) } : r
          )
        );
      }
    } catch (err) {
      console.error("Failed to update cell:", err);
    }
  };

  const updateRowTitle = async (rowId: string, newTitle: string) => {
    try {
      const res = await fetch(`/api/pages/${pageId}/rows/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: newTitle }),
      });

      if (res.ok) {
        setRows(
          rows.map((r) => (r.id === rowId ? { ...r, title: newTitle } : r))
        );
      }
    } catch (err) {
      console.error("Failed to update row title:", err);
    }
  };

  const deleteRow = async (rowId: string) => {
    try {
      const res = await fetch(`/api/pages/${pageId}/rows/${rowId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        setRows(rows.filter((r) => r.id !== rowId));
      }
    } catch (err) {
      console.error("Failed to delete row:", err);
    }
  };

  const filteredRows = rows.filter((row) => {
    if (filters.length === 0) return true;
    return filters.every((filter) => {
      const props = JSON.parse(row.properties || "{}");
      const value = props[filter.propertyId] || "";
      return value.toLowerCase().includes(filter.value.toLowerCase());
    });
  });

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-12">
        <div className="space-y-6">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Database not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-8 py-12">
        {/* Icon */}
        <div className="mb-2">
          {page.icon ? (
            <span className="text-4xl">{page.icon}</span>
          ) : (
            <Database className="h-8 w-8 text-muted-foreground" />
          )}
        </div>

        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          placeholder="Untitled database"
          className="mb-6 w-full border-none bg-transparent text-4xl font-bold text-foreground outline-none placeholder:text-muted-foreground"
        />

        {/* Toolbar */}
        <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1"
          >
            <Filter className="h-4 w-4" />
            Filter
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPropertyMenu(!showPropertyMenu)}
            className="gap-1"
          >
            <Columns className="h-4 w-4" />
            Properties
          </Button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mb-4 rounded border border-border bg-card p-3">
            <div className="mb-2 text-sm font-medium">Filters</div>
            {filters.map((filter, idx) => (
              <div key={idx} className="mb-2 flex items-center gap-2">
                <select
                  value={filter.propertyId}
                  onChange={(e) => {
                    const newFilters = [...filters];
                    newFilters[idx].propertyId = e.target.value;
                    setFilters(newFilters);
                  }}
                  className="rounded border border-border bg-background px-2 py-1 text-sm"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Input
                  value={filter.value}
                  onChange={(e) => {
                    const newFilters = [...filters];
                    newFilters[idx].value = e.target.value;
                    setFilters(newFilters);
                  }}
                  placeholder="Contains..."
                  className="h-7 w-40"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setFilters(filters.filter((_, i) => i !== idx))}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setFilters([
                  ...filters,
                  {
                    propertyId: properties[0]?.id || "",
                    value: "",
                  },
                ])
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              Add filter
            </Button>
          </div>
        )}

        {/* Add property form */}
        {showPropertyMenu && (
          <div className="mb-4 rounded border border-border bg-card p-3">
            <div className="mb-2 text-sm font-medium">Add property</div>
            <div className="flex items-center gap-2">
              <Input
                value={newProperty.name}
                onChange={(e) =>
                  setNewProperty({ ...newProperty, name: e.target.value })
                }
                placeholder="Property name"
                className="h-7 flex-1"
              />
              <select
                value={newProperty.type}
                onChange={(e) =>
                  setNewProperty({ ...newProperty, type: e.target.value })
                }
                className="rounded border border-border bg-background px-2 py-1 text-sm"
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={addProperty}>
                Add
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left text-sm font-medium text-muted-foreground">
                  Name
                </th>
                {properties.map((prop) => (
                  <th
                    key={prop.id}
                    className="px-3 py-2 text-left text-sm font-medium text-muted-foreground"
                  >
                    {prop.name}
                  </th>
                ))}
                <th className="px-3 py-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setShowPropertyMenu(!showPropertyMenu)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-1">
                    {editingRowId === row.id ? (
                      <Input
                        value={row.title}
                        onChange={(e) => updateRowTitle(row.id, e.target.value)}
                        onBlur={() => setEditingRowId(null)}
                        autoFocus
                        className="h-7 border-none bg-transparent p-0"
                      />
                    ) : (
                      <button
                        onClick={() => setEditingRowId(row.id)}
                        className="text-sm text-foreground hover:text-foreground"
                      >
                        {row.title || "Untitled"}
                      </button>
                    )}
                  </td>
                  {properties.map((prop) => {
                    const cellValue =
                      JSON.parse(row.properties || "{}")[prop.id] || "";
                    return (
                      <td key={prop.id} className="px-3 py-1">
                        {editingCell?.rowId === row.id &&
                        editingCell?.propertyId === prop.id ? (
                          <Input
                            value={cellValue}
                            onChange={(e) =>
                              updateCell(row.id, prop.id, e.target.value)
                            }
                            onBlur={() => setEditingCell(null)}
                            autoFocus
                            className="h-7 border-none bg-transparent p-0"
                          />
                        ) : (
                          <button
                            onClick={() =>
                              setEditingCell({
                                rowId: row.id,
                                propertyId: prop.id,
                              })
                            }
                            className="text-sm text-foreground hover:text-foreground"
                          >
                            {cellValue || (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => deleteRow(row.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add row */}
        <Button
          variant="ghost"
          size="sm"
          onClick={addRow}
          className="mt-2 gap-1"
        >
          <Plus className="h-4 w-4" />
          New row
        </Button>
      </div>
    </div>
  );
}
