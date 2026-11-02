/**
 * Demo fleet for the dev mock (KLEVER_MOCK=true): vehicles whose positions follow the real
 * clock, so Multi Tracking's tiles visibly move while polling. Mirrors the API shapes of
 * vehicles.lastPosition, deviceLastPositionsForVehicles and positionHistory. Never used in
 * production builds (the mock itself is dev-only).
 */

type DemoVehicle = {
  id: string;
  plateNo: string;
  vehicleName: string;
  vehicleTypeId: string;
  kind: "moving" | "idle" | "stopped" | "offline";
  center: [number, number];
  /** Loop radius in degrees and minutes per lap (moving vehicles). */
  radius: number;
  lapMin: number;
  phase: number;
};

export const DEMO_TYPES = [
  { id: "1", name: "Truck" },
  { id: "2", name: "Car" },
  { id: "3", name: "Van" },
  { id: "4", name: "SchoolBus" },
  { id: "5", name: "Motorcycle" },
  { id: "6", name: "Forklift" },
];

const FLEET: DemoVehicle[] = [
  { id: "16", plateNo: "TEST-QA-001", vehicleName: "Delivery Van", vehicleTypeId: "3", kind: "moving", center: [25.2048, 55.2708], radius: 0.03, lapMin: 18, phase: 0 },
  { id: "17", plateNo: "VERIFY-1", vehicleName: "Truck 7", vehicleTypeId: "1", kind: "moving", center: [25.0805, 55.1403], radius: 0.025, lapMin: 22, phase: 2 },
  { id: "21", plateNo: "DXB-A-12345", vehicleName: "Sales Car", vehicleTypeId: "2", kind: "moving", center: [25.2285, 55.3273], radius: 0.02, lapMin: 12, phase: 4 },
  { id: "22", plateNo: "SHJ-C-45678", vehicleName: "School Bus 3", vehicleTypeId: "4", kind: "moving", center: [25.3463, 55.4209], radius: 0.028, lapMin: 26, phase: 1 },
  { id: "23", plateNo: "DXB-M-0042", vehicleName: "Courier Bike", vehicleTypeId: "5", kind: "moving", center: [25.1972, 55.2744], radius: 0.012, lapMin: 9, phase: 3 },
  { id: "24", plateNo: "AUH-B-78901", vehicleName: "Idle Pickup", vehicleTypeId: "2", kind: "idle", center: [25.1181, 55.2006], radius: 0, lapMin: 1, phase: 0 },
  { id: "25", plateNo: "DXB-F-7781", vehicleName: "Yard Forklift", vehicleTypeId: "6", kind: "stopped", center: [25.0157, 55.0626], radius: 0, lapMin: 1, phase: 0 },
  { id: "26", plateNo: "RAK-T-3310", vehicleName: "Reefer Truck", vehicleTypeId: "1", kind: "offline", center: [25.7895, 55.9432], radius: 0, lapMin: 1, phase: 0 },
];

const REPORT_EVERY_MS = 10_000;

function iso(ms: number) {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

function fixAt(v: DemoVehicle, t: number) {
  if (v.kind !== "moving") {
    const recorded = v.kind === "offline" ? t - 3 * 3600_000 : Math.floor(t / 60_000) * 60_000;
    return {
      recordedAt: iso(recorded),
      locationLat: v.center[0],
      locationLng: v.center[1],
      speed: 0,
      heading: 90,
      ignition: v.kind === "idle",
      status: v.kind,
    };
  }
  const tq = Math.floor(t / REPORT_EVERY_MS) * REPORT_EVERY_MS;
  const a = (tq / (v.lapMin * 60_000)) * 2 * Math.PI + v.phase;
  const lat = v.center[0] + v.radius * Math.sin(a);
  const lng = v.center[1] + v.radius * 1.1 * Math.cos(a);
  // Direction of travel along the loop (counter-clockwise in lat/lng space).
  const heading = (Math.atan2(-Math.sin(a) * 1.1, Math.cos(a)) * 180) / Math.PI;
  const lapKm = 2 * Math.PI * v.radius * 111;
  return {
    recordedAt: iso(tq),
    locationLat: +lat.toFixed(6),
    locationLng: +lng.toFixed(6),
    speed: Math.round((lapKm / v.lapMin) * 60),
    heading: Math.round((heading + 360) % 360),
    ignition: true,
    status: "moving",
  };
}

export function demoVehiclePage(search: string | null, first: number, page: number, now = Date.now()) {
  const q = (search ?? "").trim().toLowerCase();
  const all = FLEET.filter((v) => !q || `${v.plateNo} ${v.vehicleName}`.toLowerCase().includes(q));
  const lastPage = Math.max(1, Math.ceil(all.length / first));
  return {
    data: all.slice((page - 1) * first, page * first).map((v) => ({
      id: v.id,
      plateNo: v.plateNo,
      vehicleName: v.vehicleName,
      vehicleTypeId: v.vehicleTypeId,
      lastPosition: fixAt(v, now),
    })),
    paginatorInfo: { total: all.length, currentPage: page, lastPage },
  };
}

export function demoVehicle(id: string, now = Date.now()) {
  const v = FLEET.find((x) => x.id === id);
  return v
    ? { id: v.id, plateNo: v.plateNo, vehicleName: v.vehicleName, vehicleTypeId: v.vehicleTypeId, lastPosition: fixAt(v, now) }
    : null;
}

export function demoLatest(ids: string[], now = Date.now()) {
  return FLEET.filter((v) => ids.includes(v.id)).map((v) => ({ vehicleId: v.id, ...fixAt(v, now) }));
}

/** positionHistory for a demo vehicle between `from` and `to`, newest first. */
export function demoTrail(id: string, from: number, to: number, first: number) {
  const v = FLEET.find((x) => x.id === id);
  if (!v || v.kind !== "moving") return [];
  const out = [];
  for (let t = Math.floor(to / REPORT_EVERY_MS) * REPORT_EVERY_MS; t >= from && out.length < first; t -= REPORT_EVERY_MS) {
    const { status: _status, ...row } = fixAt(v, t);
    void _status;
    out.push(row);
  }
  return out;
}
