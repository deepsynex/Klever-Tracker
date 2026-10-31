/**
 * Geometry for the dashboard hero: a small isometric city with a highway, a delivery truck, a
 * glowing route and a destination pin. Everything is projected from one world grid, so buildings,
 * road and truck share the same perspective. Pure data, rendered by hero-illustration.tsx.
 *
 * World axes: x runs to the screen's lower right, y to the lower left, z straight up.
 */

export const SCENE_WIDTH = 900;
export const SCENE_HEIGHT = 320;

const COS30 = Math.cos(Math.PI / 6);
/** Zoom and offset that put the truck left of the System Status card. */
const SCALE = 1.35;
const ORIGIN_X = 322;
const ORIGIN_Y = 251;

type Vec3 = [x: number, y: number, z: number];

function project([x, y, z]: Vec3): [number, number] {
  return [ORIGIN_X + COS30 * (x - y) * SCALE, ORIGIN_Y + (0.5 * (x + y) - z) * SCALE];
}

function poly(points: Vec3[]): string {
  return `M${points
    .map((p) =>
      project(p)
        .map((n) => n.toFixed(1))
        .join(" "),
    )
    .join("L")}Z`;
}

function line(points: Vec3[]): string {
  return `M${points
    .map((p) =>
      project(p)
        .map((n) => n.toFixed(1))
        .join(" "),
    )
    .join("L")}`;
}

/** Fill tokens; resolved by the component so the scene follows light and dark themes. */
export type Tone =
  | "street"
  | "roofA"
  | "roofB"
  | "wallLight"
  | "wallDark"
  | "asphalt"
  | "verge"
  | "truckTop"
  | "truckSide"
  | "truckBack"
  | "cabTop"
  | "cabSide"
  | "cabFront"
  | "glass"
  | "tyre"
  | "chassis"
  | "light";

export type Shape = { d: string; tone: Tone };

/* ───────────── Ground ───────────── */

const FAR = 900;
const ROAD_HALF = 34;

/** Streets: [axis, position, half width]. */
const STREETS: Array<["x" | "y", number, number]> = [
  ["y", -140, 12],
  ["y", 168, 12],
  ["y", -420, 12],
  ["x", -200, 12],
  ["x", 212, 12],
  ["x", -420, 12],
];

export const ground = {
  streets: STREETS.map(([axis, at, half]) =>
    axis === "y"
      ? poly([
          [-FAR, at - half, 0],
          [FAR, at - half, 0],
          [FAR, at + half, 0],
          [-FAR, at + half, 0],
        ])
      : poly([
          [at - half, -FAR, 0],
          [at + half, -FAR, 0],
          [at + half, FAR, 0],
          [at - half, FAR, 0],
        ]),
  ),
  verge: poly([
    [-ROAD_HALF - 6, -FAR, 0],
    [ROAD_HALF + 6, -FAR, 0],
    [ROAD_HALF + 6, FAR, 0],
    [-ROAD_HALF - 6, FAR, 0],
  ]),
  road: poly([
    [-ROAD_HALF, -FAR, 0],
    [ROAD_HALF, -FAR, 0],
    [ROAD_HALF, FAR, 0],
    [-ROAD_HALF, FAR, 0],
  ]),
  edgeLines: [
    line([
      [-ROAD_HALF + 3, -FAR, 0],
      [-ROAD_HALF + 3, FAR, 0],
    ]),
    line([
      [ROAD_HALF - 3, -FAR, 0],
      [ROAD_HALF - 3, FAR, 0],
    ]),
  ],
  centerLine: line([
    [0, -FAR, 0],
    [0, FAR, 0],
  ]),
};

/* ───────────── Route and pin ───────────── */

const PIN_AT: Vec3 = [-130, -140, 0];
const LANE_X = 18;

/** Trail the truck drove: from the pin along the side street, onto the highway, down to the truck. */
export const route = line([PIN_AT, [-ROAD_HALF - 4, -140, 0], [LANE_X, -126, 0], [LANE_X, -112, 0]]);

export const pin = (() => {
  const [x, y] = project(PIN_AT);
  return { x, y };
})();

/* ───────────── Buildings ───────────── */

/** [x, y, width (x), depth (y), height]. */
const BUILDINGS: Array<[number, number, number, number, number]> = [
  [-180, -116, 56, 64, 22],
  // [-110, -116] left empty: the pin's lot, so nothing hides its base
  [-180, -36, 64, 80, 46],
  [-100, -36, 40, 70, 18],
  [-172, 64, 60, 84, 30],
  [-96, 64, 40, 70, 24],
  [-180, -300, 60, 120, 28],
  [-104, -280, 44, 100, 40],
  [56, -116, 56, 80, 30],
  [128, -116, 66, 64, 48],
  [56, -16, 48, 96, 22],
  [124, -10, 70, 80, 34],
  [56, 100, 64, 54, 18],
  [60, -320, 80, 140, 26],
  [156, -300, 40, 90, 42],
  [-176, 186, 84, 90, 24],
  [56, 186, 76, 80, 30],
  [-320, -110, 80, 100, 32],
  [-320, 20, 80, 120, 22],
  [-320, -300, 80, 110, 38],
];

/** One box: roof, right (+x) wall and front (+y) wall, the three faces this view can see. */
function box(x0: number, y0: number, w: number, d: number, h: number, tones: [Tone, Tone, Tone], z0 = 0): Shape[] {
  const x1 = x0 + w;
  const y1 = y0 + d;
  return [
    {
      tone: tones[1],
      d: poly([
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, h],
        [x1, y0, h],
      ]),
    },
    {
      tone: tones[2],
      d: poly([
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y1, h],
        [x0, y1, h],
      ]),
    },
    {
      tone: tones[0],
      d: poly([
        [x0, y0, h],
        [x1, y0, h],
        [x1, y1, h],
        [x0, y1, h],
      ]),
    },
  ];
}

/* ───────────── Truck ───────────── */

const TRUCK = { x0: LANE_X - 12, x1: LANE_X + 12, base: 7 };
const TRAILER = { y0: -110, y1: -18, top: 44 };
const CAB = { y0: -15, y1: 12, top: 32 };

function wheel(y: number): Shape {
  const points: Vec3[] = [];
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    points.push([TRUCK.x1 + 0.5, y + Math.cos(t) * 7, 7 + Math.sin(t) * 7]);
  }
  return { tone: "tyre", d: poly(points) };
}

const truckShapes: Shape[] = [
  // chassis rail under the body
  {
    tone: "chassis",
    d: poly([
      [TRUCK.x1 - 1, TRAILER.y0 + 4, 4],
      [TRUCK.x1 - 1, CAB.y1 - 2, 4],
      [TRUCK.x1 - 1, CAB.y1 - 2, TRUCK.base + 1],
      [TRUCK.x1 - 1, TRAILER.y0 + 4, TRUCK.base + 1],
    ]),
  },
  ...box(
    TRUCK.x0,
    TRAILER.y0,
    TRUCK.x1 - TRUCK.x0,
    TRAILER.y1 - TRAILER.y0,
    TRAILER.top,
    ["truckTop", "truckSide", "truckBack"],
    TRUCK.base,
  ),
  ...box(
    TRUCK.x0 + 1,
    CAB.y0,
    TRUCK.x1 - TRUCK.x0 - 2,
    CAB.y1 - CAB.y0,
    CAB.top,
    ["cabTop", "cabSide", "cabFront"],
    TRUCK.base,
  ),
  // wheels sit on the outer side, in front of the body
  ...[TRAILER.y0 + 12, TRAILER.y0 + 26, TRAILER.y1 - 14, CAB.y1 - 9].map(wheel),
  // side window
  {
    tone: "glass",
    d: poly([
      [TRUCK.x1 - 0.5, CAB.y1 - 14, CAB.top - 4],
      [TRUCK.x1 - 0.5, CAB.y1 - 4, CAB.top - 4],
      [TRUCK.x1 - 0.5, CAB.y1 - 4, CAB.top - 13],
      [TRUCK.x1 - 0.5, CAB.y1 - 14, CAB.top - 13],
    ]),
  },
  // windscreen
  {
    tone: "glass",
    d: poly([
      [TRUCK.x0 + 3, CAB.y1 + 0.5, CAB.top - 3],
      [TRUCK.x1 - 3, CAB.y1 + 0.5, CAB.top - 3],
      [TRUCK.x1 - 3, CAB.y1 + 0.5, CAB.top - 13],
      [TRUCK.x0 + 3, CAB.y1 + 0.5, CAB.top - 13],
    ]),
  },
  // headlights
  ...[TRUCK.x0 + 3, TRUCK.x1 - 7].map((x) => ({
    tone: "light" as const,
    d: poly([
      [x, CAB.y1 + 0.5, 14],
      [x + 4, CAB.y1 + 0.5, 14],
      [x + 4, CAB.y1 + 0.5, 11],
      [x, CAB.y1 + 0.5, 11],
    ]),
  })),
];

export const truck = {
  /** Soft contact shadow and a teal glow on the asphalt under the truck. */
  shadow: poly([
    [TRUCK.x0 + 4, TRAILER.y0 + 4, 0],
    [TRUCK.x1 + 10, TRAILER.y0 + 4, 0],
    [TRUCK.x1 + 10, CAB.y1 + 4, 0],
    [TRUCK.x0 + 4, CAB.y1 + 4, 0],
  ]),
  headlightBeam: poly([
    [TRUCK.x0 + 1, CAB.y1 + 2, 0],
    [TRUCK.x1 - 1, CAB.y1 + 2, 0],
    [TRUCK.x1 + 6, CAB.y1 + 70, 0],
    [TRUCK.x0 - 6, CAB.y1 + 70, 0],
  ]),
};

/* ───────────── Depth-sorted objects ───────────── */

type Placed = { depth: number; shapes: Shape[] };

const placed: Placed[] = [
  ...BUILDINGS.map(([x, y, w, d, h], i) => ({
    // Farther from the viewer = smaller x + y; draw those first.
    depth: x + w + y + d,
    shapes: box(x, y, w, d, h, [i % 3 === 0 ? "roofB" : "roofA", "wallLight", "wallDark"]),
  })),
  { depth: TRUCK.x1 + CAB.y1, shapes: truckShapes },
];

export const objects: Shape[] = placed.sort((a, b) => a.depth - b.depth).flatMap((p) => p.shapes);
