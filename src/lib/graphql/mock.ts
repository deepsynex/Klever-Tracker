import "server-only";
import { demoPositions } from "@/lib/heatmap/demo-tracks";
import { DEMO_TYPES, demoLatest, demoTrail, demoVehicle, demoVehiclePage } from "@/lib/multi-tracking/demo";

/**
 * Minimal stand-in for the Klever API, used only when KLEVER_MOCK=true in development.
 * It answers the documented operations so the UI can be built and tested while the
 * real endpoint is unreachable (api-alignment.md B1). Responses mirror the guide's wording.
 */

export const MOCK_USER = { id: "1", name: "Mariam Al Hashimi", email: "admin@demo.test" };
export const MOCK_PASSWORD = "Demo@12345";
export const MOCK_RESET_TOKEN = "demo-reset-token";
const MOCK_TOKEN = "mock-token-1";

type Body = { query?: string; variables?: Record<string, unknown> };

function json(status: number, payload: unknown) {
  return { status, text: JSON.stringify(payload), contentType: "application/json" };
}

function error(message: string, extensions: Record<string, unknown> = {}) {
  return json(200, { errors: [{ message, extensions }] });
}

// Generate realistic Dubai route telemetry points
function generateMockTrack() {
  const baseLat = 25.1972;
  const baseLng = 55.2744;
  const targetLat = 25.0763;
  const targetLng = 55.1403;
  const steps = 40;
  const points = [];
  const baseDate = new Date("2026-10-12T14:00:00Z");

  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps;
    // Add small road curvature jitter
    const curve = Math.sin(fraction * Math.PI) * 0.012;
    const lat = Number((baseLat + (targetLat - baseLat) * fraction + curve).toFixed(7));
    const lng = Number((baseLng + (targetLng - baseLng) * fraction - curve * 0.5).toFixed(7));

    // Realistic speeds: two route legs with a 15-minute stop in between
    let speed = 0;
    if (i > 1 && i < steps - 1) {
      if (i >= 18 && i <= 21) {
        speed = 0; // stop / delivery at Al Quoz depot
      } else if (i >= 28 && i <= 32) {
        speed = 122; // overspeed spike on highway
      } else {
        speed = 65 + Math.round(Math.sin(i) * 15);
      }
    }

    // Advance time with a 15-minute dwell at the depot stop
    const extraDwellMs = i > 18 ? 15 * 60 * 1000 : 0;
    const pointTime = new Date(baseDate.getTime() + i * 2 * 60 * 1000 + extraDwellMs);
    points.push({
      deviceId: "1",
      recordedAt: pointTime.toISOString().replace("T", " ").substring(0, 19),
      locationLat: lat,
      locationLng: lng,
      speed,
    });
  }

  return points;
}

export async function mockFetch(rawBody: string, token?: string) {
  let body: Body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return error("Syntax Error: invalid JSON body.");
  }
  const query = body.query ?? "";
  const vars = body.variables ?? {};

  // Small delay so loading states are visible during development.
  await new Promise((r) => setTimeout(r, 200));

  if (/\bping\b/.test(query)) {
    return json(200, { data: { ping: "Klever Tracker GraphQL API is up. (mock)" } });
  }

  // Mock only: reads the email from the Google ID token without verifying it. The real backend must
  // verify the signature and audience (backend-requests/login-with-google.md).
  if (/\bloginWithGoogle\s*\(/.test(query)) {
    let email = "";
    try {
      const payload = String(vars.idToken ?? "").split(".")[1] ?? "";
      email = String(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).email ?? "").toLowerCase();
    } catch {
      return error("Invalid Google token.");
    }
    if (email === MOCK_USER.email) {
      return json(200, { data: { loginWithGoogle: { token: MOCK_TOKEN, user: MOCK_USER } } });
    }
    return error("This Google account is not registered.", { reason: "not_registered" });
  }

  if (/\blogout\b/.test(query)) {
    if (token !== MOCK_TOKEN) return error("Unauthenticated.");
    return json(200, { data: { logout: true } });
  }

  if (/\blogin\s*\(/.test(query)) {
    if (vars.email === MOCK_USER.email && vars.password === MOCK_PASSWORD) {
      return json(200, { data: { login: { token: MOCK_TOKEN, user: MOCK_USER } } });
    }
    return error("Invalid credentials.");
  }

  if (/\bforgotPassword\s*\(/.test(query)) {
    return json(200, { data: { forgotPassword: true } });
  }

  if (/\bresetPassword\s*\(/.test(query)) {
    if (vars.token !== MOCK_RESET_TOKEN || vars.email !== MOCK_USER.email) {
      return error("This password reset token is invalid.");
    }
    return json(200, { data: { resetPassword: true } });
  }

  if (token !== MOCK_TOKEN) {
    return error("Unauthenticated.", { category: "authentication" });
  }

  // Multi Tracking (src/lib/multi-tracking): a demo fleet that moves with the real clock.
  // Matched by operation name, before the generic vehicles / positionHistory handlers.
  if (/\bMultiTrackVehicles\b/.test(query)) {
    const page = demoVehiclePage((vars.search as string | null) ?? null, Number(vars.first ?? 50), Number(vars.page ?? 1));
    return json(200, { data: { vehicles: page } });
  }
  if (/\bMultiTrackTypes\b/.test(query)) {
    return json(200, { data: { vehicleTypes: { data: DEMO_TYPES } } });
  }
  if (/\bMultiTrackSelected\b/.test(query)) {
    const data: Record<string, unknown> = {};
    for (const [, alias, id] of query.matchAll(/(v\d+):\s*vehicle\(id:\s*(\d+)\)/g)) data[alias] = demoVehicle(id);
    return json(200, { data });
  }
  if (/\bMultiTrackPositions\b/.test(query)) {
    const ids = Array.isArray(vars.vehicleIds) ? vars.vehicleIds.map(String) : [];
    return json(200, { data: { deviceLastPositionsForVehicles: demoLatest(ids) } });
  }
  if (/\bMultiTrackTrail\b/.test(query)) {
    const rows = demoTrail(String(vars.vehicleId), Date.parse(String(vars.from)), Date.parse(String(vars.to)), Number(vars.first ?? 500));
    return json(200, { data: { positionHistory: { data: rows, paginatorInfo: { total: rows.length } } } });
  }

  // Tyre module (src/lib/graphql/tyres.ts): company 1's QA data, read-only.
  if (/\baxleConfigurations\b/.test(query)) {
    const side = (axleNo: number, dual: boolean) =>
      (dual ? ["LO", "LI", "RI", "RO"] : ["L", "R"]).map((code, i) => ({
        code: `A${axleNo}${code}`,
        axleNo,
        side: code.startsWith("L") ? "left" : "right",
        placement: dual ? (code.endsWith("O") ? "outer" : "inner") : "single",
        sortOrder: axleNo * 10 + i,
      }));
    const layout = (id: string, code: string, name: string, axles: boolean[]) => ({
      id,
      code,
      name,
      positions: axles.flatMap((dual, i) => side(i + 1, dual)),
    });
    return json(200, {
      data: {
        axleConfigurations: [
          layout("1", "4x2", "4x2 (2 axles, rear drive)", [false, true]),
          layout("2", "4x4", "4x4 (2 axles, all-wheel drive)", [false, true]),
          layout("3", "6x2", "6x2 (3 axles, rear drive)", [false, true, true]),
          layout("4", "6x4", "6x4 (3 axles, tandem drive)", [false, true, true]),
          layout("5", "2x_trailer", "Trailer — 2 axles", [false, true]),
          layout("6", "3x_trailer", "Trailer — 3 axles", [true, true, true]),
        ],
      },
    });
  }
  if (/\bcustomers\s*\(/.test(query)) {
    const customer = { id: "1", companyId: "1", name: "QA Test Customer", area: "Al Quoz", emirate: "Dubai", country: "UAE", email: "qa.customer@example.com", contactName: "QA Contact", contactPhone: "+971500000001", address: null, status: "active" };
    return json(200, { data: { customers: { data: [customer], paginatorInfo: { total: 1 } } } });
  }
  if (/\bownFleet:\s*false\b/.test(query)) {
    const truck = { id: "16", companyId: "1", customerId: "1", plateNo: "TEST-QA-001", vehicleName: "QA Truck 1", vehicleTypeId: "1", axleConfigurationId: "4", application: "regional", dailyAvgRunningKm: 250, photoPath: null, status: "active" };
    return json(200, { data: { vehicles: { data: [truck], paginatorInfo: { total: 1 } } } });
  }
  if (/\btyreSizes\b/.test(query)) {
    const named = (rows: string[]) => ({ data: rows.map((name, i) => ({ id: String(i + 1), companyId: "1", name })) });
    const product = (id: string, tyreSizeId: string, tyreBrandId: string, displayName: string, pattern: string, plyRating: number) => ({
      id, companyId: "1", tyreSizeId, tyreBrandId, displayName, pattern, plyRating, loadSpeedIndex: "156/150L", recommendedPressurePsi: 120, originalTreadDepthMm: 18, status: "active",
    });
    return json(200, {
      data: {
        tyreSizes: named(["315/80R22.5", "11R22.5", "295/80R22.5"]),
        tyreBrands: named(["APOLLO", "BOTO", "CEAT"]),
        tyreProducts: {
          data: [
            product("1", "1", "1", "315/80R22.5 APOLLO ENDURACE RD 18PR", "ENDURACE RD", 18),
            product("2", "1", "3", "315/80R22.5 CEAT WINMILE 18PR", "WINMILE", 18),
            product("3", "2", "2", "11R22.5 BOTO BT926 16PR", "BT926", 16),
          ],
        },
        tyreRecommendations: {
          data: ["check_alignment", "rotate_tyre", "correct_pressure", "retread_tyre"].map((code, i) => ({
            id: String(i + 1),
            companyId: "1",
            code,
            title: code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            description: null,
          })),
        },
      },
    });
  }

  // Vehicles query
  if (/\bvehicles\b/.test(query)) {
    return json(200, {
      data: {
        vehicles: {
          data: [
            { id: "1", plateNo: "DXB-A-12345", vehicleTypeId: "1", status: "active", odometerKm: 45210.5 },
            { id: "2", plateNo: "AUH-B-78901", vehicleTypeId: "12", status: "active", odometerKm: 28400.0 },
            { id: "3", plateNo: "SHJ-C-45678", vehicleTypeId: "3", status: "active", odometerKm: 14120.2 },
          ],
          paginatorInfo: { total: 3 },
        },
      },
    });
  }

  // Devices query
  if (/\bdevices\b/.test(query)) {
    return json(200, {
      data: {
        devices: {
          data: [
            { id: "1", imei: "862272088660768", status: "installed" },
            { id: "2", imei: "862272088660769", status: "installed" },
          ],
        },
      },
    });
  }

  // Route detail query
  if (/\broute\s*\(/.test(query)) {
    return json(200, {
      data: {
        route: {
          id: String(vars.id ?? "1"),
          name: "Dubai Logistics Corridor (SZR - JAFZA)",
          points: [
            { id: "101", sequence: 1, address: "Downtown Dubai Hub", locationLat: 25.1972, locationLng: 55.2744 },
            { id: "102", sequence: 2, address: "Al Quoz Logistics Center", locationLat: 25.138, locationLng: 55.228 },
            { id: "103", sequence: 3, address: "Dubai Marina Gateway", locationLat: 25.0763, locationLng: 55.1403 },
          ],
        },
      },
    });
  }

  // Routes list query
  if (/\broutes\b/.test(query)) {
    return json(200, {
      data: {
        routes: {
          data: [
            { id: "1", name: "Dubai Logistics Corridor (SZR - JAFZA)" },
            { id: "2", name: "Abu Dhabi - Dubai Expressway Run" },
          ],
        },
      },
    });
  }

  // Event types query
  if (/\beventTypes\b/.test(query)) {
    return json(200, {
      data: {
        eventTypes: {
          data: [
            { id: "2", name: "Overspeed", code: "overspeed" },
            { id: "3", name: "Ignition On", code: "ignition_on" },
            { id: "4", name: "Ignition Off", code: "ignition_off" },
            { id: "5", name: "Low Battery", code: "low_battery" },
            { id: "6", name: "Device Offline", code: "device_offline" },
            { id: "7", name: "Geofence Enter", code: "geofence_enter" },
            { id: "8", name: "Geofence Exit", code: "geofence_exit" },
            { id: "9", name: "Idling", code: "idling" },
            { id: "10", name: "Working Hours Violation", code: "working_hours_violation" },
          ],
        },
      },
    });
  }

  // Alert events query
  if (/\balertEvents\b/.test(query)) {
    return json(200, {
      data: {
        alertEvents: {
          data: [
            {
              id: "1",
              eventTypeId: "3",
              vehicleId: "1",
              occurredAt: "2026-10-12 14:00:00",
              acknowledgedAt: null,
              resolvedAt: null,
            },
            {
              id: "2",
              eventTypeId: "9",
              vehicleId: "1",
              occurredAt: "2026-10-12 14:30:00",
              acknowledgedAt: null,
              resolvedAt: null,
            },
            {
              id: "3",
              eventTypeId: "2",
              vehicleId: "1",
              occurredAt: "2026-10-12 14:51:00",
              acknowledgedAt: null,
              resolvedAt: null,
            },
            {
              id: "4",
              eventTypeId: "4",
              vehicleId: "1",
              occurredAt: "2026-10-12 16:00:00",
              acknowledgedAt: null,
              resolvedAt: null,
            },
          ],
        },
      },
    });
  }

  // Heatmap positions: demo routes across Dubai and Sharjah, newest first and paged like the API.
  if (/\bHeatmapPositions\b/.test(query)) {
    const all = demoPositions({
      vehicleId: vars.vehicleId != null ? String(vars.vehicleId) : undefined,
      deviceId: vars.deviceId != null ? String(vars.deviceId) : undefined,
      from: String(vars.from ?? ""),
      to: String(vars.to ?? ""),
    });
    const first = Number(vars.first ?? 1000);
    const page = Number(vars.page ?? 1);
    const lastPage = Math.max(1, Math.ceil(all.length / first));
    return json(200, {
      data: {
        positionHistory: {
          data: all.slice((page - 1) * first, page * first),
          paginatorInfo: { total: all.length, currentPage: page, lastPage },
        },
      },
    });
  }

  // Position history query
  if (/\bpositionHistory\b/.test(query)) {
    const data = generateMockTrack();
    return json(200, {
      data: {
        positionHistory: {
          data,
          paginatorInfo: { total: data.length },
        },
      },
    });
  }

  return error("This operation isn't available in mock mode yet.");
}
