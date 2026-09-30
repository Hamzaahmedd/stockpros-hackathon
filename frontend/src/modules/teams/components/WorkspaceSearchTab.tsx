import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { apiErrorMessage } from "@/shared/utils/api-error";
import { useState } from "react";
import { toast } from "react-toastify";
import { teamService } from "../services";
import type { WorkspaceSearchResults } from "../types";
import { formatDate } from "../utils";

const MIN_QUERY_LENGTH = 2;

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground">({count})</span>
      </h3>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

const resultCard = "rounded-lg border border-border p-3 text-sm";

/** Search across the workspace's shared watchlists, screeners, notes, and members' saved AI decisions. */
export function WorkspaceSearchTab() {
  const [query, setQuery] = useState("");
  const [searchedFor, setSearchedFor] = useState<string | null>(null);
  const [results, setResults] = useState<WorkspaceSearchResults | null>(null);
  const [searching, setSearching] = useState(false);

  const trimmed = query.trim();
  const tooShort = trimmed.length < MIN_QUERY_LENGTH;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tooShort || searching) return;
    setSearching(true);
    try {
      setResults(await teamService.search(trimmed));
      setSearchedFor(trimmed);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Search failed"));
    } finally {
      setSearching(false);
    }
  };

  const total = results
    ? results.watchlists.length +
      results.screeners.length +
      results.notes.length +
      results.forecasts.length
    : 0;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} role="search" className="flex gap-2">
        <label htmlFor="workspace-search" className="sr-only">
          Search the workspace
        </label>
        <Input
          id="workspace-search"
          value={query}
          maxLength={100}
          placeholder="Search watchlists, screeners, notes and saved forecasts — e.g. AAPL"
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit" disabled={tooShort || searching}>
          {searching ? "Searching…" : "Search"}
        </Button>
      </form>
      {query.length > 0 && tooShort && (
        <p className="-mt-4 text-xs text-muted-foreground">
          Type at least {MIN_QUERY_LENGTH} characters.
        </p>
      )}

      {results && total === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing in the workspace matches &quot;{searchedFor}&quot;.
        </p>
      )}

      {results && total > 0 && (
        <div className="space-y-6">
          <Section title="Shared watchlists" count={results.watchlists.length}>
            {results.watchlists.map((w) => (
              <li key={w.id} className={resultCard}>
                <p className="font-medium">{w.name}</p>
                <p className="text-muted-foreground break-words">{w.symbols.join(", ")}</p>
              </li>
            ))}
          </Section>

          <Section title="Screener presets" count={results.screeners.length}>
            {results.screeners.map((s) => (
              <li key={s.id} className={resultCard}>
                <p className="font-medium">{s.name}</p>
                <pre className="mt-1 overflow-x-auto text-xs text-muted-foreground">
                  {JSON.stringify(s.criteria, null, 2)}
                </pre>
              </li>
            ))}
          </Section>

          <Section title="Research notes" count={results.notes.length}>
            {results.notes.map((n) => (
              <li key={n.id} className={resultCard}>
                <p>
                  <span className="font-semibold">{n.symbol}</span>
                  <span className="text-xs text-muted-foreground"> · {formatDate(n.createdAt)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap">{n.content}</p>
              </li>
            ))}
          </Section>

          <Section title="Saved AI decisions" count={results.forecasts.length}>
            {results.forecasts.map((f) => (
              <li key={f.id} className={`${resultCard} flex flex-wrap items-center justify-between gap-2`}>
                <span>
                  <span className="font-semibold">{f.symbol}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · market {f.marketDecision}, portfolio {f.portfolioDecision}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(f.confidence * 100)}% confidence · {formatDate(f.run.runAt)}
                </span>
              </li>
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}
