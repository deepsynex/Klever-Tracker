import { describe, expect, it } from "vitest";
import { sinceInspection, whereNow, type MoveEvent, type RemovalEvent } from "./report-changes";

const INSPECTED = "2026-11-20 11:26:13";
const LATER = "2026-11-20 12:00:00";
const EARLIER = "2026-11-19 09:00:00";

describe("since the inspection", () => {
  it("keeps a tyre that wasn't touched, and ignores changes from before the inspection", () => {
    const removals: RemovalEvent[] = [{ position: "D2RI", removedAt: EARLIER }];
    expect(sinceInspection("D2RI", INSPECTED, removals, null)).toEqual({ kind: "same", source: "D2RI" });
    expect(sinceInspection("FR", INSPECTED, [], [])).toEqual({ kind: "same", source: "FR" });
  });

  it("without the move log, a tyre taken off since means the reading no longer applies", () => {
    const removals: RemovalEvent[] = [{ position: "D2RI", removedAt: LATER }];
    expect(sinceInspection("D2RI", INSPECTED, removals, null)).toEqual({ kind: "changed" });
  });

  it("with the move log: a replacement is a new tyre, and a swap carries each reading", () => {
    const removals: RemovalEvent[] = [{ position: "D2RI", removedAt: LATER }];
    const moves: MoveEvent[] = [
      { fromPosition: "D2LI", toPosition: "D1LI", movedAt: LATER },
      { fromPosition: "D1LI", toPosition: "D2LI", movedAt: LATER },
    ];
    expect(sinceInspection("D2RI", INSPECTED, removals, moves)).toEqual({ kind: "new" });
    expect(sinceInspection("D1LI", INSPECTED, removals, moves)).toEqual({ kind: "moved", source: "D2LI" });
    expect(sinceInspection("D2LI", INSPECTED, removals, moves)).toEqual({ kind: "moved", source: "D1LI" });
  });

  it("follows a tyre over several moves, and spots a new tyre where one moved away", () => {
    // FL taken off; D1LI → FL; D1LO → D1LI; a new tyre on D1LO.
    const removals: RemovalEvent[] = [{ position: "FL", removedAt: "2026-11-20 12:00:00" }];
    const moves: MoveEvent[] = [
      { fromPosition: "D1LI", toPosition: "FL", movedAt: "2026-11-20 12:00:01" },
      { fromPosition: "D1LO", toPosition: "D1LI", movedAt: "2026-11-20 12:00:02" },
    ];
    expect(sinceInspection("FL", INSPECTED, removals, moves)).toEqual({ kind: "moved", source: "D1LI" });
    expect(sinceInspection("D1LI", INSPECTED, removals, moves)).toEqual({ kind: "moved", source: "D1LO" });
    expect(sinceInspection("D1LO", INSPECTED, removals, moves)).toEqual({ kind: "new" });
    // Two moves in a row: SP1 → D2RO, then D2RO → D2RI.
    const chain: MoveEvent[] = [
      { fromPosition: "SP1", toPosition: "D2RO", movedAt: "2026-11-20 12:00:00" },
      { fromPosition: "D2RO", toPosition: "D2RI", movedAt: "2026-11-20 13:00:00" },
    ];
    expect(sinceInspection("D2RI", INSPECTED, [], chain)).toEqual({ kind: "moved", source: "SP1" });
  });

  it("says where each inspected tyre is now", () => {
    const removals: RemovalEvent[] = [{ position: "D2RI", removedAt: LATER }];
    const moves: MoveEvent[] = [
      { fromPosition: "D2LI", toPosition: "D1LI", movedAt: LATER },
      { fromPosition: "D1LI", toPosition: "D2LI", movedAt: LATER },
    ];
    const codes = ["D1LI", "D2LI", "D2RI", "FR"];
    expect(whereNow(codes, codes, INSPECTED, removals, moves)).toEqual({
      D1LI: "D2LI",
      D2LI: "D1LI",
      D2RI: null,
      FR: "FR",
    });
  });
});
