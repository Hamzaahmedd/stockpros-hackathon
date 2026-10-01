import { Button } from "@/shared/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { teamService } from "../services";
import type { PendingInvite } from "../types";
import { apiErrorMessage, formatDate } from "../utils";

interface PendingInvitesProps {
  /** Changing this reloads the list (a new invite was just sent). */
  refreshKey: number;
  /** Seat counts change when an invite is revoked. */
  onChanged: () => void;
}

/** Unexpired invites, each holding a seat until it is accepted, revoked or expires. */
export function PendingInvites({ refreshKey, onChanged }: PendingInvitesProps) {
  const [invites, setInvites] = useState<PendingInvite[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInvites(await teamService.listInvites());
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load invites"));
      setInvites([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const run = async (id: string, action: () => Promise<void>) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  };

  const resend = (invite: PendingInvite) =>
    run(invite.id, async () => {
      try {
        const result = await teamService.resendInvite(invite.id);
        toast.success(
          result.emailQueued
            ? `A fresh invite was sent to ${invite.email}`
            : `Invite renewed, but the email couldn't be sent — share the new link with ${invite.email}`,
        );
        await load();
      } catch (err) {
        toast.error(apiErrorMessage(err, "Failed to resend invite"));
      }
    });

  const revoke = (invite: PendingInvite) =>
    run(invite.id, async () => {
      try {
        await teamService.revokeInvite(invite.id);
        toast.success("Invite revoked");
        await load();
        onChanged();
      } catch (err) {
        toast.error(apiErrorMessage(err, "Failed to revoke invite"));
      }
    });

  if (invites === null || invites.length === 0) return null;

  return (
    <section aria-labelledby="pending-invites" className="space-y-2">
      <h2 id="pending-invites" className="text-sm font-semibold">
        Pending invites
      </h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((invite) => (
              <TableRow key={invite.id}>
                <TableCell>{invite.email}</TableCell>
                <TableCell>{invite.role}</TableCell>
                <TableCell>{formatDate(invite.expiresAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId !== null}
                      onClick={() => void resend(invite)}
                    >
                      Resend
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-red-500"
                      disabled={busyId !== null}
                      onClick={() => void revoke(invite)}
                    >
                      Revoke
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
