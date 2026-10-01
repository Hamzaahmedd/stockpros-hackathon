import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("react-toastify", () => ({ toast }));

import { ReasonModal } from "./ReasonModal";

const REASON = "Customer escalation #4821, approved";

const setup = (overrides: Partial<React.ComponentProps<typeof ReasonModal>> = {}) => {
  const props = {
    title: "Override plan",
    confirmLabel: "Confirm",
    successMessage: "Done",
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  };
  render(<ReasonModal {...props} />);
  return props;
};

beforeEach(() => vi.clearAllMocks());

describe("ReasonModal", () => {
  it("keeps Confirm disabled until the reason is long enough", async () => {
    setup();
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Reason (audited)"), "too short");
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Reason (audited)"), " but now it is long enough");
    expect(confirm).toBeEnabled();
  });

  it("stays disabled while the extra fields are invalid", async () => {
    setup({ canSubmit: false });
    await userEvent.type(screen.getByLabelText("Reason (audited)"), REASON);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("submits the trimmed reason, then reports success and closes", async () => {
    const props = setup();
    await userEvent.type(screen.getByLabelText("Reason (audited)"), `  ${REASON}  `);
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith(REASON));
    expect(toast.success).toHaveBeenCalledWith("Done");
    expect(props.onDone).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it("shows the server's message and stays open when the action fails", async () => {
    const failure = { response: { data: { message: "Deduction exceeds the current credit balance" } } };
    const props = setup({ onSubmit: vi.fn().mockRejectedValue(failure) });
    await userEvent.type(screen.getByLabelText("Reason (audited)"), REASON);
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Deduction exceeds the current credit balance"),
    );
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onDone).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
  });
});
