import { describe, expect, it } from "vitest";
import { pagesToRead } from "./fetch-readings";

describe("pagesToRead", () => {
  it("reads every remaining page of a small window", () => {
    expect(pagesToRead(1)).toEqual({ pages: [], partial: false });
    expect(pagesToRead(3)).toEqual({ pages: [2, 3], partial: false });
    expect(pagesToRead(5)).toEqual({ pages: [2, 3, 4, 5], partial: false });
  });

  it("reads only the oldest page of a big window (page 1, the newest, is already read)", () => {
    expect(pagesToRead(12)).toEqual({ pages: [12], partial: true });
  });
});
