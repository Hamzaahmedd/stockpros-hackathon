import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVEAL_VISIBLE_MS } from "../constants";

const service = vi.hoisted(() => ({ revealUser: vi.fn() }));
vi.mock("../services", () => ({ adminService: service }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CustomerIdentity } from "./CustomerIdentity";

const REASON = "Customer asked us to confirm the address";
const REAL = {
  id: "u1",
  email: "sam@fund.com",
  displayName: "Sam Lee",
  phoneNumber: "+923001234567",
};

const renderMasked = () =>
  render(<CustomerIdentity userId="u1" displayName="S*** L***" email="s***@f***.com" masked />);

beforeEach(() => {
  vi.clearAllMocks();
  service.revealUser.mockResolvedValue(REAL);
});

afterEach(() => vi.useRealTimers());

type User = ReturnType<typeof userEvent.setup>;

/** The dialog's confirm button shares its name with the inline Reveal button, so scope to the dialog. */
const dialogConfirm = () => within(screen.getByRole("dialog")).getByRole("button", { name: "Reveal" });

const reveal = async (user: User = userEvent.setup()) => {
  await user.click(screen.getByRole("button", { name: "Reveal" }));
  await user.type(screen.getByLabelText("Reason (audited)"), REASON);
  await user.type(screen.getByLabelText("Support ticket"), "SUP-9");
  await user.click(dialogConfirm());
};

describe("CustomerIdentity", () => {
  it("shows no Reveal button when the API did not mask anything", () => {
    render(<CustomerIdentity userId="u1" displayName="Sam Lee" email="sam@fund.com" />);
    expect(screen.getByText("sam@fund.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reveal" })).not.toBeInTheDocument();
  });

  it("shows masked values and requires a reason (and optional ticket) to reveal", async () => {
    renderMasked();
    expect(screen.getByText("s***@f***.com")).toBeInTheDocument();
    expect(screen.queryByText("sam@fund.com")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // The dialog's confirm button stays disabled until a valid reason is typed.
    expect(dialogConfirm()).toBeDisabled();
  });

  it("reveals the real name, email and phone after an audited request", async () => {
    renderMasked();
    await reveal();

    await waitFor(() => expect(service.revealUser).toHaveBeenCalledWith("u1", REASON, "SUP-9"));
    expect(await screen.findByText("sam@fund.com")).toBeInTheDocument();
    expect(screen.getByText("Sam Lee")).toBeInTheDocument();
    expect(screen.getByText("+923001234567")).toBeInTheDocument();
  });

  it("masks again when Hide is pressed", async () => {
    renderMasked();
    await reveal();
    await screen.findByText("sam@fund.com");

    await userEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByText("sam@fund.com")).not.toBeInTheDocument();
    expect(screen.getByText("s***@f***.com")).toBeInTheDocument();
  });

  it("masks again on its own after the visibility window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderMasked();
    await reveal(user);
    await screen.findByText("sam@fund.com");

    await act(async () => {
      vi.advanceTimersByTime(REVEAL_VISIBLE_MS + 1);
    });

    expect(screen.queryByText("sam@fund.com")).not.toBeInTheDocument();
    expect(screen.getByText("s***@f***.com")).toBeInTheDocument();
  });
});
