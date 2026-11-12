import { describe, expect, it } from "vitest";
import { isSwipeAway } from "./dismissed";

describe("isSwipeAway", () => {
  it("removes after dragging more than a third of the width, either way", () => {
    expect(isSwipeAway(140, 380, 2000)).toBe(true);
    expect(isSwipeAway(-140, 380, 2000)).toBe(true);
  });

  it("springs back after a short, slow drag", () => {
    expect(isSwipeAway(60, 380, 1000)).toBe(false);
  });

  it("removes after a quick flick even if short", () => {
    expect(isSwipeAway(-60, 380, 80)).toBe(true);
  });

  it("ignores tiny moves however fast", () => {
    expect(isSwipeAway(20, 380, 10)).toBe(false);
  });
});
