import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { isRecord } from "@/shared/utils/type-guards";
import { useCallback, useEffect, useState } from "react";
import { FiTrash2 } from "react-icons/fi";
import { toast } from "react-toastify";
import { teamService } from "../services";
import type { ResearchNote, SharedScreener, SharedWatchlist, Team } from "../types";
import { apiErrorMessage, formatDate, isTeamAdmin } from "../utils";

type AssetPanel = "watchlists" | "screeners" | "notes";

const PANELS: { id: AssetPanel; label: string }[] = [
  { id: "watchlists", label: "Watchlists" },
  { id: "screeners", label: "Screeners" },
  { id: "notes", label: "Research notes" },
];

interface PanelProps {
  team: Team;
  currentUserId: string;
}

/** Loads a list on mount and exposes a reload; shared by the three asset panels. */
function useAssetList<T>(fetcher: () => Promise<T[]>) {
  const [items, setItems] = useState<T[] | null>(null);
  const load = useCallback(async () => {
    try {
      const list = await fetcher();
      setItems(Array.isArray(list) ? list : []);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load"));
      setItems([]);
    }
  }, [fetcher]);
  useEffect(() => {
    void load();
  }, [load]);
  return { items, load };
}

const canDelete = (team: Team, ownerId: string, currentUserId: string) =>
  ownerId === currentUserId || isTeamAdmin(team.role);

export function SharedAssetsTab({ team, currentUserId }: PanelProps) {
  const [panel, setPanel] = useState<AssetPanel>("watchlists");

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Shared assets" className="flex gap-2">
        {PANELS.map((p) => (
          <Button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={panel === p.id}
            size="sm"
            variant={panel === p.id ? "default" : "outline"}
            onClick={() => setPanel(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      {panel === "watchlists" && <WatchlistsPanel team={team} currentUserId={currentUserId} />}
      {panel === "screeners" && <ScreenersPanel team={team} currentUserId={currentUserId} />}
      {panel === "notes" && <NotesPanel team={team} currentUserId={currentUserId} />}
    </div>
  );
}

function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={label}
      className="text-red-500"
      onClick={onClick}
    >
      <FiTrash2 />
    </Button>
  );
}

function WatchlistsPanel({ team, currentUserId }: PanelProps) {
  const { items, load } = useAssetList<SharedWatchlist>(teamService.listWatchlists);
  const [name, setName] = useState("");
  const [symbols, setSymbols] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const list = symbols
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (!name.trim() || list.length === 0) return;
    try {
      await teamService.createWatchlist(name.trim(), list);
      setName("");
      setSymbols("");
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to create watchlist"));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await teamService.deleteWatchlist(id);
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to delete"));
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
        <Input aria-label="Watchlist name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          aria-label="Symbols"
          placeholder="Symbols, e.g. AAPL, MSFT, NVDA"
          value={symbols}
          onChange={(e) => setSymbols(e.target.value)}
        />
        <Button type="submit">Share watchlist</Button>
      </form>
      {items === null ? (
        <Skeleton className="h-24 w-full" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shared watchlists yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground break-words">{item.symbols.join(", ")}</p>
              </div>
              {canDelete(team, item.createdBy, currentUserId) && (
                <DeleteButton label={`Delete ${item.name}`} onClick={() => handleDelete(item.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScreenersPanel({ team, currentUserId }: PanelProps) {
  const { items, load } = useAssetList<SharedScreener>(teamService.listScreeners);
  const [name, setName] = useState("");
  const [criteria, setCriteria] = useState('{\n  "minMarketCap": 1000000000\n}');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(criteria);
    } catch {
      toast.error("Criteria must be valid JSON");
      return;
    }
    if (!isRecord(parsed)) {
      toast.error("Criteria must be a JSON object");
      return;
    }
    if (!name.trim()) return;
    try {
      await teamService.createScreener(name.trim(), parsed);
      setName("");
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to create screener"));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await teamService.deleteScreener(id);
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to delete"));
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="space-y-2">
        <Input aria-label="Screener name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea
          aria-label="Screener criteria (JSON)"
          rows={4}
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          className="w-full rounded-md border border-input bg-transparent p-3 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button type="submit">Share screener preset</Button>
      </form>
      {items === null ? (
        <Skeleton className="h-24 w-full" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No screener presets yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="font-medium">{item.name}</p>
                <pre className="mt-1 overflow-x-auto text-xs text-muted-foreground">
                  {JSON.stringify(item.criteria, null, 2)}
                </pre>
              </div>
              {canDelete(team, item.createdBy, currentUserId) && (
                <DeleteButton label={`Delete ${item.name}`} onClick={() => handleDelete(item.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotesPanel({ team, currentUserId }: PanelProps) {
  const { items, load } = useAssetList<ResearchNote>(() => teamService.listNotes());
  const [symbol, setSymbol] = useState("");
  const [content, setContent] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim() || !content.trim()) return;
    try {
      await teamService.createNote(symbol.trim().toUpperCase(), content.trim());
      setSymbol("");
      setContent("");
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to add note"));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await teamService.deleteNote(id);
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to delete"));
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="space-y-2">
        <Input
          aria-label="Symbol"
          placeholder="Symbol, e.g. AAPL"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="md:w-48"
        />
        <textarea
          aria-label="Research note"
          rows={3}
          placeholder="What does the team need to know?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full rounded-md border border-input bg-transparent p-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button type="submit">Add note</Button>
      </form>
      {items === null ? (
        <Skeleton className="h-24 w-full" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No research notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm">
                  <span className="font-semibold">{item.symbol}</span>
                  <span className="text-xs text-muted-foreground"> · {formatDate(item.createdAt)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{item.content}</p>
              </div>
              {canDelete(team, item.authorId, currentUserId) && (
                <DeleteButton label={`Delete note on ${item.symbol}`} onClick={() => handleDelete(item.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
