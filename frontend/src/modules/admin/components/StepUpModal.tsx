import { Modal } from "@/shared/components/Modal";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useState } from "react";
import { toast } from "react-toastify";
import { STEP_UP_CODE_PATTERN } from "../constants";
import { adminService } from "../services";
import { apiErrorMessage } from "../utils";

interface Props {
  /** Called once the code is accepted; the caller retries the action it was blocked on. */
  onVerified: () => void;
  onClose: () => void;
}

/**
 * Sensitive actions need a recent identity check. The staff member asks for a
 * code, receives it by email, and enters it here; the blocked action then runs.
 */
export function StepUpModal({ onVerified, onClose }: Readonly<Props>) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setBusy(true);
    try {
      await adminService.requestStepUp();
      setSent(true);
      toast.success("Verification code sent to your email");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not send the verification code"));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      await adminService.verifyStepUp(code.trim());
      onVerified();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Verification failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Verify it's you"
      description="This action needs a recent identity check. We'll email you a 6-digit code."
    >
      <div className="space-y-4">
        {sent && (
          <div>
            <label htmlFor="admin-step-up-code" className="mb-1 block text-sm font-medium">
              Verification code
            </label>
            <Input
              id="admin-step-up-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value.replaceAll(/\D/g, ""))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The code expires in 5 minutes. After you verify, you can keep working for a while without
              being asked again.
            </p>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant={sent ? "outline" : "default"} disabled={busy} onClick={() => void sendCode()}>
            {sent ? "Resend code" : "Email me a code"}
          </Button>
          {sent && (
            <Button
              type="button"
              disabled={busy || !STEP_UP_CODE_PATTERN.test(code)}
              onClick={() => void verify()}
            >
              Verify
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
