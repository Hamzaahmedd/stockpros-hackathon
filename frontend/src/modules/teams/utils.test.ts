import { describe, expect, it } from "vitest";
import { TeamJoinPolicy, type JoinOption } from "./types";
import { JOIN_POLICY_LABELS, joinActionLabel, parseJoinPolicy } from "./utils";

const option = (joinPolicy: JoinOption["joinPolicy"]): JoinOption => ({
  teamId: "team-1",
  teamName: "Alpha Fund",
  domain: "fund.com",
  joinPolicy,
});

describe("joinActionLabel", () => {
  it("joins at once for auto-approve domains", () => {
    expect(joinActionLabel(option(TeamJoinPolicy.AUTO_APPROVE))).toBe("Join Alpha Fund");
  });

  it("asks to join when an admin must approve", () => {
    expect(joinActionLabel(option(TeamJoinPolicy.REQUEST_APPROVAL))).toBe(
      "Request to join Alpha Fund",
    );
  });
});

describe("parseJoinPolicy", () => {
  it.each(Object.values(TeamJoinPolicy))("accepts %s", (policy) => {
    expect(parseJoinPolicy(policy)).toBe(policy);
  });

  it("rejects anything else", () => {
    expect(parseJoinPolicy("OPEN_TO_ALL")).toBeUndefined();
    expect(parseJoinPolicy("")).toBeUndefined();
  });
});

describe("JOIN_POLICY_LABELS", () => {
  it("labels every policy for the dropdown", () => {
    expect(JOIN_POLICY_LABELS).toEqual({
      INVITE_ONLY: "Invite only",
      REQUEST_APPROVAL: "Require admin approval",
      AUTO_APPROVE: "Auto-approve",
    });
  });
});
