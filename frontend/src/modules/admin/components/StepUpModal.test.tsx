import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ requestStepUp: vi.fn(), verifyStepUp: vi.fn() }));
vi.mock("../services", () => ({ adminService: service }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("react-toastify", () => ({ toast }));

import { StepUpModal } from "./StepUpModal";

const setup = () => {
  const props = { onVerified: vi.fn(), onClose: vi.fn() };
  render(<StepUpModal {...props} />);
  return props;
};

beforeEach(() => {
  vi.clearAllMocks();
  service.requestStepUp.mockResolvedValue(undefined);
  service.verifyStepUp.mockResolvedValue(undefined);
});

describe("StepUpModal", () => {
  it("starts by offering to email a code, with no code field yet", () => {
    setup();
    expect(screen.getByRole("button", { name: "Email me a code" })).toBeEnabled();
    expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
  });

  it("requests a code, then shows the field and a resend option", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Email me a code" }));

    expect(service.requestStepUp).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText("Verification code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend code" })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalled();
  });

  it("keeps Verify disabled until six digits are entered, and strips non-digits", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    const field = await screen.findByLabelText("Verification code");
    const verify = screen.getByRole("button", { name: "Verify" });

    await userEvent.type(field, "12a34");
    expect(field).toHaveValue("1234");
    expect(verify).toBeDisabled();

    await userEvent.type(field, "56");
    expect(verify).toBeEnabled();
  });

  it("verifies the code and tells the caller to carry on", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await userEvent.type(await screen.findByLabelText("Verification code"), "482913");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(service.verifyStepUp).toHaveBeenCalledWith("482913"));
    expect(props.onVerified).toHaveBeenCalledTimes(1);
  });

  it("shows the server's message and stays open when the code is wrong", async () => {
    service.verifyStepUp.mockRejectedValue({
      response: { data: { message: "Incorrect verification code" } },
    });
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await userEvent.type(await screen.findByLabelText("Verification code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Incorrect verification code"));
    expect(props.onVerified).not.toHaveBeenCalled();
  });

  it("reports a failure to send the code without revealing the field", async () => {
    service.requestStepUp.mockRejectedValue({
      response: { data: { message: "Please wait a minute before requesting another code." } },
    });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Email me a code" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Please wait a minute before requesting another code."),
    );
    expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument();
  });

  it("closes on Cancel", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onClose).toHaveBeenCalled();
  });
});
