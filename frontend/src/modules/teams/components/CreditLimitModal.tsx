import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Modal } from "@/shared/components/Modal";
import { formatPaisa } from "@/modules/plans/utils";
import { useState } from "react";
import { toast } from "react-toastify";
import { teamService } from "../services";
import type { TeamMember } from "../types";
import { apiErrorMessage } from "../utils";

interface CreditLimitModalProps {
  member: TeamMember | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Edits a member's monthly cap on drawing from the shared credit pool (blank = no cap). */
export function CreditLimitModal({ member, onClose, onSaved }: CreditLimitModalProps) {
  const initialRupees =
    member?.monthlyCreditLimitPaisa == null
      ? ""
      : String(member.monthlyCreditLimitPaisa / 100);
  const [rupees, setRupees] = useState(initialRupees);
  const [saving, setSaving] = useState(false);

  const parsed = rupees.trim() === "" ? null : Number(rupees);
  const invalid = parsed !== null && (!Number.isFinite(parsed) || parsed < 0);

  const handleSave = async () => {
    if (!member || saving || invalid) return;
    setSaving(true);
    try {
      await teamService.setMemberCreditLimit(
        member.userId,
        parsed === null ? null : Math.round(parsed * 100),
      );
      toast.success("Credit limit updated");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update credit limit"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={member !== null}
      onClose={onClose}
      title={`Credit limit — ${member?.displayName ?? ""}`}
      description="The most this person can draw from the shared credit pool each month, once their AI quota is used. Leave blank for no cap."
    >
      <label htmlFor="credit-limit" className="text-sm font-medium">
        Monthly limit (Rs)
      </label>
      <Input
        id="credit-limit"
        type="number"
        min={0}
        step={50}
        value={rupees}
        onChange={(e) => setRupees(e.target.value)}
        placeholder="No limit"
        className="mt-1"
      />
      {parsed !== null && !invalid && (
        <p className="mt-1 text-xs text-muted-foreground">
          ≈ {Math.floor((parsed * 100) / 5000)} extra AI signals per month ({formatPaisa(Math.round(parsed * 100))})
        </p>
      )}
      {invalid && <p className="mt-1 text-xs text-red-500">Enter a non-negative amount.</p>}
      <div className="mt-5 flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" className="flex-1" disabled={saving || invalid} onClick={handleSave}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}
