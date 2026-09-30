import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Modal } from "@/shared/components/Modal";
import { useState } from "react";
import { FiCopy } from "react-icons/fi";
import { toast } from "react-toastify";
import { teamService } from "../services";
import type { InvitableRole, InviteResult } from "../types";
import { apiErrorMessage, parseInvitableRole } from "../utils";

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Only the owner may invite admins. */
  canInviteAdmin: boolean;
  onInvited: () => void;
}

export function InviteMemberModal({
  isOpen,
  onClose,
  canInviteAdmin,
  onInvited,
}: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("MEMBER");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);

  const handleClose = () => {
    setEmail("");
    setRole("MEMBER");
    setResult(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !email.trim()) return;
    setSubmitting(true);
    try {
      setResult(await teamService.createInvite(email.trim(), role));
      onInvited();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to send invite"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.inviteLink);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={result ? "Invite sent" : "Invite a member"}
      description={
        result
          ? undefined
          : "They'll get an email with a link to join. Invites expire after 7 days."
      }
    >
      {result ? (
        <div className="space-y-4">
          <p className="text-sm">
            {result.emailQueued ? (
              <>
                An invite email was sent to{" "}
                <span className="font-medium">{result.invite.email}</span>.
              </>
            ) : (
              <span className="text-amber-500">
                We couldn&apos;t send the email, but the invite is active — share the link below
                with {result.invite.email} directly.
              </span>
            )}
          </p>
          <div>
            <label htmlFor="invite-link" className="text-xs text-muted-foreground">
              Invite link (shown once)
            </label>
            <div className="mt-1 flex gap-2">
              <Input id="invite-link" readOnly value={result.inviteLink} />
              <Button type="button" variant="outline" size="icon" aria-label="Copy invite link" onClick={handleCopy}>
                <FiCopy />
              </Button>
            </div>
          </div>
          <Button type="button" className="w-full" onClick={handleClose}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="invite-email" className="text-sm font-medium">
              Email address
            </label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="analyst@yourfund.com"
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="invite-role" className="text-sm font-medium">
              Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(parseInvitableRole(e.target.value) ?? "MEMBER")}
              className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="MEMBER">Member</option>
              {canInviteAdmin && <option value="ADMIN">Admin</option>}
            </select>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={submitting}>
              {submitting ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
