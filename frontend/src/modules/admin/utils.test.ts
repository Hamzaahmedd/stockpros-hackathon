import { describe, expect, it } from "vitest";
import {
  actionLabel,
  formatDateTime,
  hasPlatformRole,
  isStaffRole,
  isValidReason,
  isValidTicketRef,
} from "./utils";

describe("hasPlatformRole", () => {
  it("orders roles from USER up to SUPER_ADMIN", () => {
    expect(hasPlatformRole("SUPER_ADMIN", "PLATFORM_ADMIN")).toBe(true);
    expect(hasPlatformRole("PLATFORM_ADMIN", "PLATFORM_ADMIN")).toBe(true);
    expect(hasPlatformRole("SUPPORT_AGENT", "PLATFORM_ADMIN")).toBe(false);
  });

  it("treats a missing role as a plain USER", () => {
    expect(hasPlatformRole(undefined, "SUPPORT_AGENT")).toBe(false);
    expect(hasPlatformRole(undefined, "USER")).toBe(true);
  });
});

describe("isStaffRole", () => {
  it.each(["SUPPORT_AGENT", "PLATFORM_ADMIN", "SUPER_ADMIN"] as const)("accepts %s", (role) => {
    expect(isStaffRole(role)).toBe(true);
  });

  it("rejects USER and a missing role", () => {
    expect(isStaffRole("USER")).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });
});

describe("isValidReason", () => {
  it("requires at least 10 characters after trimming", () => {
    expect(isValidReason("too short")).toBe(false);
    expect(isValidReason("   padded   ")).toBe(false);
    expect(isValidReason("Ticket #4821 approved")).toBe(true);
  });
});

describe("isValidTicketRef", () => {
  it("allows a blank field (the API decides whether a ticket is required)", () => {
    expect(isValidTicketRef("")).toBe(true);
    expect(isValidTicketRef("   ")).toBe(true);
  });

  it.each(["SUP-1234", "INC9-204", "  AB-1  "])("accepts %s", (value) => {
    expect(isValidTicketRef(value)).toBe(true);
  });

  it.each(["sup-1234", "SUP1234", "S-1", "SUP-", "SUP-12 34"])("rejects %s", (value) => {
    expect(isValidTicketRef(value)).toBe(false);
  });
});

describe("labels and dates", () => {
  it("humanises audit actions", () => {
    expect(actionLabel("SEAT_CAPACITY_OVERRIDE")).toBe("Seat capacity override");
  });

  it("renders a dash for a missing date", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("2026-01-15T10:30:00.000Z")).toMatch(/2026/);
  });
});
