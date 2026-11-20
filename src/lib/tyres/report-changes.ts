/**
 * What happened to the tyres after an inspection, for the tyre report: which reading belongs to the
 * tyre on each position now. Tyres taken off come from the removal history; moves and swaps come from
 * the move log once the API has one (until then `moves` is null). Times are the API's UTC strings
 * ("YYYY-MM-DD HH:MM:SS"), which sort as text. Pure, so it's unit tested.
 */

export type RemovalEvent = { position: string; removedAt: string };
export type MoveEvent = { fromPosition: string; toPosition: string; movedAt: string };

/**
 * The tyre on a position now, against the inspection:
 * - `same`: the tyre inspected there (its reading applies);
 * - `moved`: the tyre inspected on `source`, moved here since (that reading applies);
 * - `new`: a tyre that wasn't inspected (fitted since);
 * - `changed`: the inspected tyre was taken off since, and without the move log it isn't known
 *   whether the tyre here now is new or moved in, so no reading applies.
 */
export type SinceInspection =
  { kind: "same"; source: string } | { kind: "moved"; source: string } | { kind: "new" } | { kind: "changed" };

/**
 * Follows the tyre on `position` back to the inspection, through the moves and removals after it
 * (and before `until`, for the tyre that was there at an earlier time). A swap logs two moves at the
 * same time; a tyre arriving counts before one leaving at the same moment.
 */
export function sinceInspection(
  position: string,
  inspectedAt: string,
  removals: RemovalEvent[],
  moves: MoveEvent[] | null,
  until = "9999-12-31 23:59:59",
): SinceInspection {
  let at = position;
  let before = until;
  for (;;) {
    const between = (t: string) => t > inspectedAt && t < before;
    const events = [
      ...(moves ?? [])
        .filter((m) => m.toPosition === at && between(m.movedAt))
        .map((m) => ({ time: m.movedAt, rank: 1, from: m.fromPosition as string | null })),
      ...(moves ?? [])
        .filter((m) => m.fromPosition === at && m.toPosition !== at && between(m.movedAt))
        .map((m) => ({ time: m.movedAt, rank: 0, from: null })),
      ...removals
        .filter((r) => r.position === at && between(r.removedAt))
        .map((r) => ({ time: r.removedAt, rank: 0, from: null })),
    ].sort((a, b) => b.time.localeCompare(a.time) || b.rank - a.rank);
    const last = events[0];
    if (!last) return at === position ? { kind: "same", source: at } : { kind: "moved", source: at };
    if (last.from === null) return moves ? { kind: "new" } : { kind: "changed" };
    at = last.from;
    before = last.time;
  }
}

/** Where each inspected tyre is now: position inspected → position now (null when it was taken off). */
export function whereNow(
  inspected: string[],
  current: string[],
  inspectedAt: string,
  removals: RemovalEvent[],
  moves: MoveEvent[] | null,
): Record<string, string | null> {
  const now: Record<string, string | null> = Object.fromEntries(inspected.map((p) => [p, null]));
  for (const position of current) {
    const s = sinceInspection(position, inspectedAt, removals, moves);
    if (s.kind === "same" || s.kind === "moved") now[s.source] = position;
  }
  return now;
}
