/**
 * A company's own axle configuration, described the way people think of it (a list of axles, front
 * first: steer, drive or trailer, one or two tyres a side) and turned into the tyre positions the
 * API stores, in the same naming as the standard layouts:
 * - steer: FR, FL (second steer axle F2R, F2L; twin tyres F2RO … like a drive axle)
 * - drive: D1LO, D1LI, D1RI, D1RO (single tyres: D1R, D1L)
 * - trailer: T1LO, T1LI, T1RI, T1RO (single tyres: T1R, T1L)
 * Pure, so it's unit tested. Errors are translation keys under `validation.*`.
 */
import type { AxlePosition } from "@/lib/graphql/tyres";
import { axleRows } from "./axle-layout";

export type AxleKindInput = "steer" | "drive" | "trailer";
export type AxleSpec = { kind: AxleKindInput; dual: boolean };

export const AXLE_KINDS: AxleKindInput[] = ["steer", "drive", "trailer"];
export const MAX_AXLES = 6;
export const MAX_CONFIG_SPARES = 4;

const PREFIX: Record<AxleKindInput, string> = { steer: "F", drive: "D", trailer: "T" };

/** The tyre positions for a list of axles (front first), with sort order front to back. */
export function buildPositions(axles: AxleSpec[]): AxlePosition[] {
  const seen: Record<AxleKindInput, number> = { steer: 0, drive: 0, trailer: 0 };
  const out: AxlePosition[] = [];
  axles.forEach((axle, i) => {
    seen[axle.kind] += 1;
    const n = seen[axle.kind];
    // The first steer axle keeps the standard short codes (FR, FL).
    const base = axle.kind === "steer" && n === 1 ? "F" : `${PREFIX[axle.kind]}${n}`;
    const axleNo = i + 1;
    const add = (suffix: string, side: AxlePosition["side"], placement: AxlePosition["placement"]) =>
      out.push({ code: `${base}${suffix}`, axleNo, side, placement, sortOrder: out.length + 1 });
    if (axle.dual) {
      add("LO", "left", "outer");
      add("LI", "left", "inner");
      add("RI", "right", "inner");
      add("RO", "right", "outer");
    } else {
      add("R", "right", "single");
      add("L", "left", "single");
    }
  });
  return out;
}

/** The axle list behind a saved configuration (to edit it). */
export function axlesFromPositions(positions: AxlePosition[]): AxleSpec[] {
  return axleRows(positions).map((row) => ({
    kind: row.kind === "steer" ? "steer" : row.kind === "trailer" ? "trailer" : "drive",
    dual: row.left.length > 1 || row.right.length > 1,
  }));
}

/** A code to start from: "6x4" style (wheel ends × driven wheel ends), or "2x_trailer". */
export function suggestCode(axles: AxleSpec[]): string {
  if (!axles.length) return "";
  if (axles.every((a) => a.kind === "trailer")) return `${axles.length}x_trailer`;
  return `${axles.length * 2}x${axles.filter((a) => a.kind === "drive").length * 2}`;
}

const CODE = /^[a-z0-9][a-z0-9_]*$/;
const norm = (s: string) => s.trim().toLowerCase();

/**
 * Code (lower-case letters, digits, underscores) and name required and not used by another
 * configuration the company can see; 0–4 spares; 1–6 axles. A trailer has only trailer axles; a
 * truck has steer axles first and at least one drive axle.
 */
export function validateAxleConfiguration(
  values: { code: string; name: string; spareCount: string },
  axles: AxleSpec[],
  existing: Array<{ id: string; code: string; name: string }>,
  selfId?: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const others = existing.filter((e) => e.id !== selfId);
  const code = norm(values.code);
  if (!code) errors.code = "required";
  else if (!CODE.test(code)) errors.code = "axleCodeFormat";
  else if (others.some((e) => norm(e.code) === code)) errors.code = "duplicateCode";
  const name = norm(values.name);
  if (!name) errors.name = "required";
  else if (others.some((e) => norm(e.name) === name)) errors.name = "duplicateName";
  const spares = Number(values.spareCount);
  if (!/^\d+$/.test(values.spareCount.trim()) || spares > MAX_CONFIG_SPARES) errors.spareCount = "sparesRange";

  if (!axles.length) errors.axles = "axlesRequired";
  else if (axles.length > MAX_AXLES) errors.axles = "axlesMax";
  else {
    const trailers = axles.filter((a) => a.kind === "trailer").length;
    if (trailers && trailers !== axles.length) errors.axles = "axleMix";
    else if (!trailers) {
      const firstDrive = axles.findIndex((a) => a.kind === "drive");
      if (
        axles[0]!.kind !== "steer" ||
        (firstDrive !== -1 && axles.slice(firstDrive).some((a) => a.kind === "steer"))
      ) {
        errors.axles = "steerFirst";
      } else if (firstDrive === -1) errors.axles = "driveRequired";
    }
  }
  return errors;
}
