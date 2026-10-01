import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pager } from "./Pager";

describe("Pager", () => {
  it("renders nothing when everything fits on one page", () => {
    const { container } = render(<Pager result={{ page: 1, total: 10, limit: 25 }} onPage={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("walks forward and back and reports the page count", async () => {
    const onPage = vi.fn();
    render(<Pager result={{ page: 2, total: 60, limit: 25 }} onPage={onPage} />);

    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));

    expect(onPage).toHaveBeenNthCalledWith(1, 3);
    expect(onPage).toHaveBeenNthCalledWith(2, 1);
  });

  it("disables Previous on the first page and Next on the last", () => {
    const { rerender } = render(<Pager result={{ page: 1, total: 60, limit: 25 }} onPage={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    rerender(<Pager result={{ page: 3, total: 60, limit: 25 }} onPage={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
