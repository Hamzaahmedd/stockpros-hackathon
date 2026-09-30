import { Button } from "@/shared/components/ui/button";
import { useState } from "react";
import { toast } from "react-toastify";
import { teamService } from "../services";
import { apiErrorMessage } from "../utils";

const MAX_LENGTH = 4000;

interface InstructionsEditorProps {
  initial: string | null;
  /** Owners/admins can edit; everyone else sees read-only text. */
  canEdit: boolean;
  onSaved: () => void;
}

/** Workspace-wide AI instructions, returned as `orgContext` on forecasts and decisions. */
export function InstructionsEditor({ initial, canEdit, onSaved }: InstructionsEditorProps) {
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = value.trim() !== (initial ?? "").trim();

  const handleSave = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      await teamService.updateInstructions(value.trim() || null);
      toast.success("Instructions saved");
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to save instructions"));
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
        {initial || "No workspace instructions set."}
      </p>
    );
  }

  return (
    <div>
      <label htmlFor="org-instructions" className="sr-only">
        Organization instructions
      </label>
      <textarea
        id="org-instructions"
        value={value}
        maxLength={MAX_LENGTH}
        rows={5}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. We are a long-only value fund. Flag anything above 25x earnings and always note ESG risks."
        className="w-full rounded-md border border-input bg-transparent p-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {value.length}/{MAX_LENGTH}
        </span>
        <Button type="button" size="sm" disabled={!dirty || saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save instructions"}
        </Button>
      </div>
    </div>
  );
}
