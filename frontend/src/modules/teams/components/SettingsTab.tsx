import { Modal } from "@/shared/components/Modal";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { teamService } from "../services";
import type { Team, TeamMember } from "../types";
import { apiErrorMessage, isTeamAdmin, saveBlob } from "../utils";

interface SettingsTabProps {
  team: Team;
  reload: () => void;
  isOwner: boolean;
}

function RenameCard({ team, reload }: Pick<SettingsTabProps, "team" | "reload">) {
  const [name, setName] = useState(team.name);
  const [saving, setSaving] = useState(false);
  const trimmed = name.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !trimmed || trimmed === team.name) return;
    setSaving(true);
    try {
      await teamService.rename(trimmed);
      toast.success("Workspace renamed");
      reload();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to rename workspace"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Workspace name</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="workspace-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="mt-1"
            />
          </div>
          <Button type="submit" disabled={saving || !trimmed || trimmed === team.name}>
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TransferModal({
  isOpen,
  onClose,
  onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [target, setTarget] = useState("");
  const [working, setWorking] = useState(false);

  // Loaded when the dialog opens; only seated members can receive ownership.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    teamService
      .listMembers()
      .then((list) => {
        if (!cancelled) setMembers(list.filter((member) => member.role !== "OWNER"));
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(apiErrorMessage(err, "Failed to load members"));
        setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const close = () => {
    setMembers(null);
    setTarget("");
    onClose();
  };

  const confirm = async () => {
    if (!target || working) return;
    setWorking(true);
    try {
      await teamService.transferOwnership(target);
      toast.success("Ownership transferred — you are now an admin");
      close();
      onDone();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to transfer ownership"));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Transfer ownership"
      description="The new owner controls billing, roles and deleting the workspace. You stay on as an admin."
    >
      <label htmlFor="transfer-target" className="text-sm font-medium">
        New owner
      </label>
      <select
        id="transfer-target"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
      >
        <option value="">Choose a member…</option>
        {(members ?? []).map((member) => (
          <option key={member.userId} value={member.userId}>
            {member.displayName}
            {member.email ? ` (${member.email})` : ""}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-muted-foreground">
        Only people who have already joined can be chosen — a pending invite cannot receive ownership.
      </p>
      <div className="mt-5 flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={close}>
          Cancel
        </Button>
        <Button type="button" className="flex-1" disabled={!target || working} onClick={() => void confirm()}>
          {working ? "Transferring…" : "Transfer"}
        </Button>
      </div>
    </Modal>
  );
}

function DeleteModal({
  team,
  isOpen,
  onClose,
}: {
  team: Team;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [working, setWorking] = useState(false);

  const close = () => {
    setTyped("");
    onClose();
  };

  const confirm = async () => {
    if (typed !== team.name || working) return;
    setWorking(true);
    try {
      await teamService.deleteWorkspace(typed);
      toast.success("Workspace deleted");
      // A full reload refetches the session: the plan and navigation change.
      window.location.assign("/dashboard");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to delete workspace"));
      setWorking(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Delete workspace"
      description="This cannot be undone."
    >
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Every member loses access and returns to their personal plan.</li>
        <li>Shared watchlists, screeners, notes, invites and domains are deleted.</li>
        <li>Any remaining shared credit is forfeited and subscription renewal stops.</li>
        <li>Payment history is kept for your records.</li>
      </ul>
      <label htmlFor="delete-confirm" className="mt-4 block text-sm font-medium">
        Type <span className="font-mono">{team.name}</span> to confirm
      </label>
      <Input
        id="delete-confirm"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        className="mt-1"
      />
      <div className="mt-5 flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={close}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="flex-1"
          disabled={typed !== team.name || working}
          onClick={() => void confirm()}
        >
          {working ? "Deleting…" : "Delete workspace"}
        </Button>
      </div>
    </Modal>
  );
}

export function SettingsTab({ team, reload, isOwner }: SettingsTabProps) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      saveBlob(await teamService.exportWorkspace(), "workspace-export.json");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to export workspace"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {isTeamAdmin(team.role) && <RenameCard key={team.name} team={team} reload={reload} />}

      {isOwner && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ownership</CardTitle>
              <CardDescription>
                Hand the workspace to another member. Owners must do this before leaving.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" variant="outline" onClick={() => setTransferOpen(true)}>
                Transfer ownership
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Export</CardTitle>
              <CardDescription>
                Download the workspace&apos;s settings, members, shared assets, payments and activity
                as a JSON file.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" variant="outline" disabled={exporting} onClick={() => void handleExport()}>
                {exporting ? "Preparing…" : "Export workspace data"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-red-500/40">
            <CardHeader>
              <CardTitle className="text-base text-red-500">Delete workspace</CardTitle>
              <CardDescription>
                Permanently ends the workspace for everyone in it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
                Delete workspace
              </Button>
            </CardContent>
          </Card>

          <TransferModal
            isOpen={transferOpen}
            onClose={() => setTransferOpen(false)}
            onDone={reload}
          />
          <DeleteModal team={team} isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} />
        </>
      )}
    </div>
  );
}
