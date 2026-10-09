import { describe, expect, it } from "vitest";
import { ago, sydneyDay } from "./admin";

describe("admin helpers", () => {
  const now = new Date("2026-10-09T05:00:00Z");
  it("formats relative times for queues", () => {
    expect(ago("2026-10-09T04:59:30Z", now)).toBe("just now");
    expect(ago("2026-10-09T04:48:00Z", now)).toBe("12 min ago");
    expect(ago("2026-10-09T02:00:00Z", now)).toBe("3 h ago");
    expect(ago("2026-10-07T05:00:00Z", now)).toBe("2 d ago");
    expect(ago("2026-09-01T05:00:00Z", now)).toBe("1 Sept 2026");
  });

  it("uses Sydney calendar days across daylight saving", () => {
    expect(sydneyDay("2026-10-08T14:30:00Z")).toBe("2026-10-09");
    expect(sydneyDay("2026-07-08T14:30:00Z")).toBe("2026-07-09");
    expect(sydneyDay("2026-10-03T14:30:00Z")).toBe("2026-10-04");
  });
});
