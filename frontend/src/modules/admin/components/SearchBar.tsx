import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useState, type FormEvent } from "react";

interface Props {
  label: string;
  placeholder: string;
  busy?: boolean;
  onSearch: (query: string) => void;
}

/** Single-field search form shared by the lookup tabs (min 2 chars, mirroring the API). */
export function SearchBar({ label, placeholder, busy = false, onSearch }: Readonly<Props>) {
  const [query, setQuery] = useState("");
  const valid = query.trim().length >= 2;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) onSearch(query.trim());
  };

  return (
    <form onSubmit={submit} className="flex gap-2" role="search">
      <Input
        aria-label={label}
        value={query}
        placeholder={placeholder}
        onChange={(event) => setQuery(event.target.value)}
      />
      <Button type="submit" disabled={!valid || busy}>
        {busy ? "Searching…" : "Search"}
      </Button>
    </form>
  );
}
