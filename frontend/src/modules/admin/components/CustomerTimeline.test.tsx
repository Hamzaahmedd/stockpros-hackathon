import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelinePage } from "../types";

const service = vi.hoisted(() => ({ getTimeline: vi.fn() }));
vi.mock("../services", () => ({ adminService: service }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CustomerTimeline } from "./CustomerTimeline";

const page = (overrides: Partial<TimelinePage> = {}): TimelinePage => ({
  items: [
    {
      id: "pay1",
      type: "PAYMENT",
      title: "Seat addition payment completed",
      detail: "TEAM · 749900 paisa",
      ticketRef: null,
      at: "2026-01-01T10:05:00.000Z",
    },
    {
      id: "adm1",
      type: "STAFF_ACTION",
      title: "Staff: Plan override",
      detail: "Ada Admin · Enterprise pilot approved",
      ticketRef: "SUP-77",
      at: "2026-01-01T10:07:00.000Z",
    },
  ],
  nextBefore: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  service.getTimeline.mockResolvedValue(page());
});

describe("CustomerTimeline", () => {
  it("lists events with their type, title, detail and ticket", async () => {
    render(<CustomerTimeline userId="u1" onClose={vi.fn()} />);

    expect(await screen.findByText("Seat addition payment completed")).toBeInTheDocument();
    expect(service.getTimeline).toHaveBeenCalledWith("u1", undefined);
    expect(screen.getByText("SUP-77")).toBeInTheDocument();
    expect(screen.getByText(/Enterprise pilot approved/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load older" })).not.toBeInTheDocument();
  });

  it("loads older events with the cursor and appends them", async () => {
    service.getTimeline
      .mockResolvedValueOnce(page({ nextBefore: "2026-01-01T10:05:00.000Z" }))
      .mockResolvedValueOnce({
        items: [
          {
            id: "ses1",
            type: "SESSION",
            title: "Signed in",
            detail: null,
            ticketRef: null,
            at: "2026-01-01T09:00:00.000Z",
          },
        ],
        nextBefore: null,
      });
    render(<CustomerTimeline userId="u1" onClose={vi.fn()} />);

    await userEvent.click(await screen.findByRole("button", { name: "Load older" }));

    await waitFor(() =>
      expect(service.getTimeline).toHaveBeenLastCalledWith("u1", "2026-01-01T10:05:00.000Z"),
    );
    expect(await screen.findByText("Signed in")).toBeInTheDocument();
    expect(screen.getByText("Seat addition payment completed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load older" })).not.toBeInTheDocument();
  });

  it("says so when there is no activity, and closes on request", async () => {
    service.getTimeline.mockResolvedValue({ items: [], nextBefore: null });
    const onClose = vi.fn();
    render(<CustomerTimeline userId="u1" onClose={onClose} />);

    expect(await screen.findByText("No recorded activity.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
