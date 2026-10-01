import { formatPaisa } from "@/modules/plans/utils";
import { ConfirmationModal } from "@/shared/components/ConfirmationModal";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
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
import type { Team, TeamMember } from "../types";
import {
  apiErrorMessage,
  canDo,
  formatDate,
  isTeamAdmin,
  parseInvitableRole,
  TeamAction,
} from "../utils";
import { CreditLimitModal } from "./CreditLimitModal";
import { InviteMemberModal } from "./InviteMemberModal";
import { PendingInvites } from "./PendingInvites";

interface MembersTabProps {
  team: Team;
  /** Refresh the parent workspace (seat counts change when members come and go). */
  reloadTeam: () => void;
  currentUserId: string;
}

export function MembersTab({ team, reloadTeam, currentUserId }: MembersTabProps) {
  const admin = isTeamAdmin(team.role);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [invitesKey, setInvitesKey] = useState(0);

  const load = useCallback(async () => {
    try {
      setMembers(await teamService.listMembers());
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load members"));
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    void load();
    reloadTeam();
  };

  const handleRemove = async () => {
    if (!removing) return;
    try {
      await teamService.removeMember(removing.userId);
      toast.success(`${removing.displayName} was removed`);
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to remove member"));
    }
  };

  const handleRoleChange = async (member: TeamMember, value: string) => {
    const role = parseInvitableRole(value);
    if (!role || role === member.role) return;
    try {
      await teamService.changeMemberRole(member.userId, role);
      toast.success(`${member.displayName} is now ${role === "ADMIN" ? "an admin" : "a member"}`);
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to change role"));
    }
  };

  const handleLeave = async () => {
    try {
      await teamService.leave();
      toast.success("You left the workspace");
      // A full reload refetches the session, so the plan and navigation update.
      window.location.assign("/dashboard");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to leave workspace"));
    }
  };

  // Only the owner changes roles; nobody changes the owner's or their own.
  const canChangeRole = (member: TeamMember): boolean =>
    canDo(team.role, TeamAction.CHANGE_ROLES) &&
    member.role !== "OWNER" &&
    member.userId !== currentUserId;

  // Admins can manage plain members; only the owner manages admins; nobody manages the owner or themselves.
  const canManage = (member: TeamMember): boolean =>
    admin &&
    member.role !== "OWNER" &&
    member.userId !== currentUserId &&
    (member.role === "MEMBER" || team.role === "OWNER");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {team.seats.active} of {team.seats.capacity} seats in use
        </p>
        <div className="flex gap-2">
          {team.role !== "OWNER" && (
            <Button type="button" variant="outline" onClick={() => setLeaving(true)}>
              Leave workspace
            </Button>
          )}
          {admin && (
            <Button type="button" onClick={() => setInviteOpen(true)}>
              Invite member
            </Button>
          )}
        </div>
      </div>

      {members === null ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {admin && <TableHead>Email</TableHead>}
                <TableHead>Role</TableHead>
                {admin && <TableHead className="text-right">Monthly credit limit</TableHead>}
                <TableHead>Joined</TableHead>
                {admin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell className="font-medium">
                    {member.displayName}
                    {member.userId === currentUserId && (
                      <span className="text-xs text-muted-foreground"> (you)</span>
                    )}
                  </TableCell>
                  {admin && <TableCell>{member.email}</TableCell>}
                  <TableCell>
                    {canChangeRole(member) ? (
                      <select
                        aria-label={`Role for ${member.displayName}`}
                        value={member.role}
                        onChange={(e) => void handleRoleChange(member, e.target.value)}
                        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                      >
                        <option value="MEMBER">MEMBER</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    ) : (
                      <Badge variant={member.role === "MEMBER" ? "secondary" : "default"}>
                        {member.role}
                      </Badge>
                    )}
                  </TableCell>
                  {admin && (
                    <TableCell className="text-right">
                      {member.monthlyCreditLimitPaisa == null
                        ? "No limit"
                        : formatPaisa(member.monthlyCreditLimitPaisa)}
                    </TableCell>
                  )}
                  <TableCell>{formatDate(member.joinedAt)}</TableCell>
                  {admin && (
                    <TableCell className="text-right">
                      {canManage(member) && (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setEditing(member)}
                          >
                            Edit limit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-red-500"
                            onClick={() => setRemoving(member)}
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {admin && (
        <PendingInvites refreshKey={invitesKey} onChanged={reloadTeam} />
      )}

      <InviteMemberModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        canInviteAdmin={team.role === "OWNER"}
        onInvited={() => {
          reloadTeam();
          setInvitesKey((key) => key + 1);
        }}
      />
      <CreditLimitModal
        key={editing?.userId ?? "none"}
        member={editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
      <ConfirmationModal
        isOpen={leaving}
        title="Leave workspace?"
        message="You'll lose access to the workspace's shared assets and credits, and your seat becomes available again. You can only rejoin with a new invite."
        confirmText="Leave"
        variant="danger"
        onConfirm={handleLeave}
        onCancel={() => setLeaving(false)}
      />
      <ConfirmationModal
        isOpen={removing !== null}
        title="Remove member?"
        message={`${removing?.displayName ?? "This person"} will lose access to the workspace and its shared credits immediately. Their seat becomes available again.`}
        confirmText="Remove"
        variant="danger"
        onConfirm={handleRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
