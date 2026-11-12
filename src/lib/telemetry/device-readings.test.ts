import { describe, expect, it } from "vitest";
import {
  engineCharging,
  formatEngineTime,
  hasReadings,
  horizontalPeakG,
  latestReadings,
  readDevice,
  signed16,
  summarisePeriod,
} from "./device-readings";

// A real record from GJ-01-KY-5144 (12 Nov, 09:13 Dubai), trimmed.
const LAST =
  '{"io_15":833,"io_17":111,"io_18":65295,"io_19":55,"io_24":15,"io_199":5360,"io_449":76877,"movement":1,"odometer_m":1071193,"external_voltage_mv":14089,"battery_voltage_mv":4118,"gsm_signal":5,"gnss_status":1,"hdop":12}';

describe("readDevice", () => {
  it("reads a full record into plain units", () => {
    const r = readDevice(LAST);
    expect(r).toMatchObject({
      odometerKm: 1071.193,
      tripKm: 5.36,
      engineSeconds: 76877,
      moving: true,
      gpsSpeedKmh: 15,
      ecoScore: 8.33,
      vehicleBatteryV: 14.089,
      trackerBatteryV: 4.118,
      gsmSignal: 5,
      gpsFix: true,
      hdop: 12,
    });
    expect(r.accelG).toEqual({ x: 0.111, y: -0.241, z: 0.055 });
  });

  it("gives nulls for a beacon-only record and broken JSON", () => {
    expect(hasReadings(readDevice('{"io_548":"01"}'))).toBe(false);
    expect(readDevice("not json").odometerKm).toBeNull();
    expect(readDevice(null).moving).toBeNull();
  });
});

describe("helpers", () => {
  it("reads 16-bit values as signed", () => {
    expect(signed16(65295)).toBe(-241);
    expect(signed16(111)).toBe(111);
  });

  it("formats engine time", () => {
    expect(formatEngineTime(76877)).toBe("21 h 21 m");
    expect(formatEngineTime(685)).toBe("11 m");
    expect(formatEngineTime(null)).toBeNull();
  });

  it("tells a charging battery (engine running) from a resting one", () => {
    expect(engineCharging(14.1)).toBe(true);
    expect(engineCharging(12.8)).toBe(false);
    expect(engineCharging(null)).toBeNull();
  });

  it("finds the strongest horizontal acceleration", () => {
    expect(horizontalPeakG(readDevice(LAST))).toBeCloseTo(0.241);
  });

  it("skips beacon records when looking for the latest readings", () => {
    const r = latestReadings([{ attributes: '{"io_548":"01"}' }, { attributes: LAST }]);
    expect(r?.odometerKm).toBeCloseTo(1071.193);
    expect(latestReadings([{ attributes: '{"io_548":"01"}' }])).toBeNull();
  });
});

describe("summarisePeriod", () => {
  it("totals distance and engine time, and finds the worst moments", () => {
    const s = summarisePeriod([
      { recordedAt: "2026-11-12 05:13:08", attributes: LAST },
      { recordedAt: "2026-11-12 05:00:00", attributes: '{"io_548":"01"}' },
      {
        recordedAt: "2026-11-12 05:01:43",
        attributes: '{"io_15":1000,"io_17":65511,"io_18":65529,"io_19":19,"io_449":76194,"odometer_m":1064400,"external_voltage_mv":13325}',
      },
      { recordedAt: "2026-11-12 05:06:00", attributes: '{"io_15":500,"io_17":497,"io_18":10,"io_19":30,"io_449":76500,"odometer_m":1068000}' },
    ]);
    // No ignition readings in these records: the plain first-to-last difference.
    expect(s.odometerKm).toBeCloseTo(6.793);
    expect(s.parkedDriftKm).toBeNull();
    expect(s.engineSeconds).toBe(683);
    expect(s.lowestEco).toBe(5);
    expect(s.peakG).toBeCloseTo(0.497);
    expect(s.harshCount).toBe(1);
  });

  it("returns nulls when nothing in the window has readings", () => {
    expect(summarisePeriod([{ recordedAt: "2026-11-12 05:00:00", attributes: '{"io_548":"01"}' }])).toEqual({
      odometerKm: null,
      parkedDriftKm: null,
      engineSeconds: null,
      lowestEco: null,
      peakG: null,
      harshCount: 0,
    });
  });
});

describe("summarisePeriod: parked GPS drift", () => {
  const rec = (at: string, odoM: number, ign: 0 | 1) => ({ recordedAt: at, attributes: JSON.stringify({ odometer_m: odoM, ignition: ign, io_449: 76000 }) });

  it("counts the odometer only while the engine is on, like the real 12 Nov night", () => {
    const s = summarisePeriod([
      rec("2026-11-11 20:02:00", 1057100, 0),
      rec("2026-11-12 01:00:00", 1061000, 0), // parked: odometer crept 3.9 km
      rec("2026-11-12 04:59:00", 1064400, 0), // parked: another 3.4 km
      rec("2026-11-12 05:01:43", 1064400, 1), // engine on
      rec("2026-11-12 05:07:00", 1068000, 1),
      rec("2026-11-12 05:13:08", 1071150, 1),
    ]);
    expect(s.odometerKm).toBeCloseTo(6.75);
    expect(s.parkedDriftKm).toBeCloseTo(7.3);
  });
});
