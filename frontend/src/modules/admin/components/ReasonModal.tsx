import { Modal } from "@/shared/components/Modal";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useState, type ReactNode } from "react";
import { toast } from "react-toastify";
import { ADMIN_MAX_REASON_LENGTH, ADMIN_MIN_REASON_LENGTH } from "../constants";
import { apiErrorMessage, isValidReason } from "../utils";

interface Props {
  title: string;
  description?: string;
  confirmLabel: string;
  successMessage: string;
  /** Extra form fields rendered above the reason input. */
  children?: ReactNode;
  /** False while the extra fields are invalid; keeps the confirm button disabled. */
  canSubmit?: boolean;
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
  destructive?: boolean;
}

/** Shared confirm dialog: every admin write must carry an audited reason. */
export function ReasonModal({
  title,
  description,
  confirmLabel,
  successMessage,
  children,
  canSubmit = true,
  onSubmit,
  onClose,
  onDone,
  destructive = false,
}: Readonly<Props>) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = canSubmit && isValidReason(reason) && !busy;

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(reason.trim());
      toast.success(successMessage);
      onDone();
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={title} description={description}>
      <div className="space-y-4">
        {children}
        <div>
          <label htmlFor="admin-reason" className="mb-1 block text-sm font-medium">
            Reason (audited)
          </label>
          <Input
            id="admin-reason"
            value={reason}
            maxLength={ADMIN_MAX_REASON_LENGTH}
            placeholder="e.g. Customer escalation #4821, approved by finance"
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            At least {ADMIN_MIN_REASON_LENGTH} characters. Stored in the immutable audit log.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={!ready}
            onClick={() => void submit()}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
