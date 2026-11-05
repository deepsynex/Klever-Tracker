import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/graphql/client";
import { isMissingFromApi, maptilerStyleUrl, resolveMapSettings } from "./map-settings";

describe("resolveMapSettings", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "env-google");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "env-map");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("falls back to Google with the env key when nothing is stored", () => {
    expect(resolveMapSettings(null)).toEqual({
      mapProvider: "google",
      googleMapsApiKey: "env-google",
      googleMapsMapId: "env-map",
      maptilerApiKey: null,
    });
  });

  it("uses the stored provider and MapTiler key, and always the env Google key", () => {
    expect(resolveMapSettings({ mapProvider: "osm", maptilerApiKey: "mt" })).toEqual({
      mapProvider: "osm",
      googleMapsApiKey: "env-google",
      googleMapsMapId: "env-map",
      maptilerApiKey: "mt",
    });
  });

  it("keeps Google when OpenStreetMap is chosen without a MapTiler key", () => {
    expect(resolveMapSettings({ mapProvider: "osm", maptilerApiKey: "  " }).mapProvider).toBe("google");
  });

  it("treats an unknown provider as Google", () => {
    expect(resolveMapSettings({ mapProvider: "bing" as never }).mapProvider).toBe("google");
  });
});

describe("isMissingFromApi", () => {
  it("spots schema errors for fields the backend hasn't added yet", () => {
    expect(isMissingFromApi(new ApiRequestError({ kind: "unknown", message: 'Cannot query field "platformSettings" on type "Query".' }))).toBe(true);
    expect(isMissingFromApi(new ApiRequestError({ kind: "forbidden", message: "Forbidden." }))).toBe(false);
  });
});

it("builds the MapTiler style URL with an encoded key", () => {
  expect(maptilerStyleUrl("a b")).toBe("https://api.maptiler.com/maps/streets-v2/style.json?key=a%20b");
});
