/**
 * Tyre planning on the axle drawing. Each tyre is known by the position it started on. Dropping a
 * tyre on another position swaps the two (or moves it there, if that position is empty); dragging
 * it out of the drawing takes it off the vehicle. Pure, so it's unit tested.
 */

/** Position code → the tyre now there (identified by the position it started on), or null when empty. */
export type RotationPlan = Record<string, string | null>;

/** Every position that has a tyre starts with its own tyre; the others start empty. */
export const initialPlan = (positions: Array<{ code: string; hasTyre: boolean }>): RotationPlan =>
  Object.fromEntries(positions.map((p) => [p.code, p.hasTyre ? p.code : null]));

/** The plan after swapping what's on positions `a` and `b` (a tyre onto an empty position just moves). */
export function swapTyres(plan: RotationPlan, a: string, b: string): RotationPlan {
  if (a === b || !(a in plan) || !(b in plan)) return plan;
  return { ...plan, [a]: plan[b] ?? null, [b]: plan[a] ?? null };
}

/** The plan with the tyre on `position` taken off the vehicle. */
export function removeTyre(plan: RotationPlan, position: string): RotationPlan {
  if (!plan[position]) return plan;
  return { ...plan, [position]: null };
}

/** Tyres taken off the vehicle, in position order (each known by the position it started on). */
export function removedTyres(plan: RotationPlan, start: RotationPlan, order: string[]): string[] {
  const onVehicle = new Set(Object.values(plan).filter(Boolean));
  return order.filter((code) => start[code] === code && !onVehicle.has(code));
}

/**
 * Puts a removed tyre back: on its own position if that's empty, else on the first empty position.
 * Unchanged when the tyre is still on the vehicle or there's no room.
 */
export function putBack(plan: RotationPlan, tyre: string, order: string[]): RotationPlan {
  if (Object.values(plan).includes(tyre)) return plan;
  const spot = plan[tyre] === null ? tyre : order.find((code) => plan[code] === null);
  return spot ? { ...plan, [spot]: tyre } : plan;
}

/** A new tyre's id in the plan (its own, since it didn't start on any position). */
export const NEW_TYRE_PREFIX = "new:";
export const isNewTyre = (tyre: string) => tyre.startsWith(NEW_TYRE_PREFIX);

/** The plan with a new tyre put on the empty `position`. Unchanged when the position isn't empty. */
export function addTyre(plan: RotationPlan, position: string): RotationPlan {
  if (!(position in plan) || plan[position]) return plan;
  let n = 1;
  while (Object.values(plan).includes(`${NEW_TYRE_PREFIX}${n}`)) n += 1;
  return { ...plan, [position]: `${NEW_TYRE_PREFIX}${n}` };
}

export type PlanRemoval = { position: string; disposition: string; note: string | null };

/**
 * What to tell the API about each tyre that left its position. Every position that started with a
 * tyre and now has a different one, or none, needs a removal. A tyre taken off says what happened to
 * it (`fates`); a tyre moved to a position that was empty says where it went (`movedNote`), since
 * its old position is now empty. A tyre swapped with another needs nothing: both positions keep a tyre.
 */
export function planRemovals(
  plan: RotationPlan,
  start: RotationPlan,
  order: string[],
  fates: Record<string, { fate: string; note: string }>,
  movedNote: (to: string) => string,
): PlanRemoval[] {
  return order.flatMap((code) => {
    if (start[code] !== code || plan[code] === code) return [];
    const now = order.find((c) => plan[c] === code);
    if (!now) return [{ position: code, disposition: fates[code]?.fate ?? "other", note: fates[code]?.note || null }];
    // Moved: only its old position going empty has to be explained.
    return plan[code] ? [] : [{ position: code, disposition: "other", note: movedNote(now) }];
  });
}
