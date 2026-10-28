"use client";

/**
 * Loads the Google Maps JavaScript API once per page. Uses the same script id and URL as the
 * history map, so whichever loads first is reused. Resolves immediately if it's already there.
 */
const SCRIPT_ID = "google-maps-api-script";
let loading: Promise<void> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const ready = () => (window.google?.maps ? resolve() : reject(new Error("Google Maps failed to initialise")));
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry`;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", ready, { once: true });
    script.addEventListener("error", () => reject(new Error("Google Maps failed to load")), { once: true });
    // The script may have finished loading before these listeners were attached.
    if (window.google?.maps) resolve();
  }).catch((err) => {
    loading = null; // allow a retry
    throw err;
  });
  return loading;
}
