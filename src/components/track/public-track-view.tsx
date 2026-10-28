"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, ExternalLink, Gauge, LinkIcon, MapPinOff, Navigation } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SharedLocationPublic } from "@/lib/graphql/vehicle-management";
import { loadGoogleMaps } from "@/lib/google-maps";
import { bearing, metres, type LatLng } from "@/lib/history/road-path";
import { formatDateTime, glideDurationMs, MAX_GLIDE_METRES, parseApiDateTime } from "@/lib/vehicle-management/helpers";

/** How often the open page asks for the vehicle's latest fix (paused while the tab is hidden). */
const REFRESH_MS = 15_000;

type TrackResponse = { link: SharedLocationPublic | null };

async function fetchLink(token: string): Promise<TrackResponse> {
  const res = await fetch(`/api/track/${encodeURIComponent(token)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** "2 min ago" in the page's language, from a past date. */
function useRelativeTime(date: Date | null) {
  const locale = useLocale();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  if (!date) return null;
  // A fix can't be in the future: a few seconds ahead is just clock difference between machines.
  const seconds = Math.min(0, Math.round((date.getTime() - now) / 1000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86_400), "day");
}

/**
 * Live view of one shared vehicle: a map that follows it, its plate, speed and last update.
 * Starts from the server-rendered fix and refreshes every REFRESH_MS.
 */
export function PublicTrackView({ token, initial }: { token: string; initial: SharedLocationPublic }) {
  const t = useTranslations("track");
  const query = useQuery({
    queryKey: ["track", token],
    queryFn: () => fetchLink(token),
    initialData: { link: initial },
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const link = query.data.link;
  const fixTime = parseApiDateTime(link?.positionRecordedAt);
  const ago = useRelativeTime(fixTime);

  if (!link) {
    // The link expired (or was deleted) while the page was open.
    return (
      <Notice icon={<LinkIcon className="size-6" />} title={t("invalidTitle")}>
        {t("invalid")}
      </Notice>
    );
  }

  // 0,0 is a fix without GPS lock (some devices report it), not a real place: treat it as no position.
  const hasPosition =
    link.latitude !== null && link.longitude !== null && !(link.latitude === 0 && link.longitude === 0);

  return (
    <div className="grid w-full gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3">
        <div className="grid gap-0.5">
          <span className="text-xs text-subtle">{t("vehicle")}</span>
          <span className="text-lg font-semibold" dir="ltr">
            {link.plateNo ?? "—"}
          </span>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
          <Stat icon={<Gauge className="size-4" />} label={t("speed")}>
            {link.speed !== null ? t("speedValue", { speed: Math.round(link.speed) }) : "—"}
          </Stat>
          <Stat icon={<Clock className="size-4" />} label={t("updated")}>
            {fixTime ? <span title={formatDateTime(link.positionRecordedAt)}>{ago}</span> : "—"}
          </Stat>
          <Stat icon={<LinkIcon className="size-4" />} label={t("expires")}>
            {formatDateTime(link.expiresAt)}
          </Stat>
        </dl>
      </div>

      {hasPosition ? (
        <LiveMap
          latitude={link.latitude!}
          longitude={link.longitude!}
          heading={link.heading}
          recordedAt={link.positionRecordedAt}
          label={link.plateNo}
        />
      ) : (
        <Notice icon={<MapPinOff className="size-6" />} title={t("noPositionTitle")}>
          {t("noPosition")}
        </Notice>
      )}

      <p className="text-center text-xs text-subtle" aria-live="polite">
        {query.isError ? t("refreshFailed") : t("autoRefresh", { seconds: REFRESH_MS / 1000 })}
      </p>
    </div>
  );
}

function Stat({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-primary" aria-hidden>
        {icon}
      </span>
      <div>
        <dt className="text-xs text-subtle">{label}</dt>
        <dd className="font-medium">{children}</dd>
      </div>
    </div>
  );
}

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="mx-auto grid w-full max-w-md gap-3 rounded-card border border-border bg-surface p-6 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary-soft text-primary">{icon}</span>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{children}</p>
    </section>
  );
}

const ARROW = { scale: 7, fillColor: "#0B6E69", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 };

type MapLike = { panTo: (p: unknown) => void; setCenter: (p: unknown) => void };
type MarkerLike = { setPosition: (p: unknown) => void; setIcon: (i: unknown) => void };

/**
 * Google map centred on the vehicle. Each new fix glides the arrow there in a straight line
 * (there is no road path on this public page), pointing the way it moves, over about the real
 * time between the two fixes, like the history playback.
 */
function LiveMap({
  latitude,
  longitude,
  heading,
  recordedAt,
  label,
}: {
  latitude: number;
  longitude: number;
  heading: number | null;
  recordedAt: string | null;
  label: string | null;
}) {
  const t = useTranslations("track");
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLike | null>(null);
  const markerRef = useRef<MarkerLike | null>(null);
  // Where the arrow is drawn now (mid-glide too), the fix it is heading to, and its direction.
  const shownRef = useRef<LatLng | null>(null);
  const lastFixTimeRef = useRef<string | null>(recordedAt);
  const rotationRef = useRef(heading ?? 0);
  const frameRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  // Create the map once, at the first fix.
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        const maps = window.google?.maps;
        if (cancelled || !maps || !containerRef.current || mapRef.current) return;
        const center = { lat: latitude, lng: longitude };
        mapRef.current = new maps.Map(containerRef.current, {
          center,
          zoom: 15,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        }) as unknown as MapLike;
        markerRef.current = new maps.Marker({
          position: center,
          map: mapRef.current,
          title: label ?? undefined,
          icon: { ...ARROW, path: maps.SymbolPath.FORWARD_CLOSED_ARROW, rotation: rotationRef.current },
        });
        shownRef.current = center;
        setReady(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
    // The map is created once; new fixes are handled by the glide effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Glide to each new fix.
  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!ready || !maps || !map || !marker) return;

    const to = { lat: latitude, lng: longitude };
    const from = shownRef.current ?? to;
    const distance = metres(from, to);
    const draw = (p: LatLng, rotation: number, follow: "pan" | "center") => {
      shownRef.current = p;
      rotationRef.current = rotation;
      const position = new maps.LatLng(p.lat, p.lng);
      marker.setPosition(position);
      marker.setIcon({ ...ARROW, path: maps.SymbolPath.FORWARD_CLOSED_ARROW, rotation });
      if (follow === "pan") map.panTo(position);
      else map.setCenter(position);
    };
    // Point along the movement; when (nearly) still, keep the device's own heading.
    const rotation = distance > 3 ? bearing(from, to) : (heading ?? rotationRef.current);

    const duration = glideDurationMs(lastFixTimeRef.current, recordedAt, REFRESH_MS);
    lastFixTimeRef.current = recordedAt;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (distance < 0.5 || distance > MAX_GLIDE_METRES || reducedMotion) {
      draw(to, rotation, "pan");
      return;
    }

    const start = performance.now();
    const frame = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      draw({ lat: from.lat + (to.lat - from.lat) * k, lng: from.lng + (to.lng - from.lng) * k }, rotation, "center");
      frameRef.current = k < 1 ? requestAnimationFrame(frame) : null;
    };
    frameRef.current = requestAnimationFrame(frame);
    return () => {
      // A newer fix arrived mid-glide: the next glide starts from where the arrow is now.
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [ready, latitude, longitude, heading, recordedAt]);

  if (!apiKey || failed) {
    return (
      <div className="grid place-items-center gap-3 rounded-card border border-border bg-surface p-8 text-center">
        <Navigation className="size-8 text-primary" style={{ transform: `rotate(${heading ?? 0}deg)` }} aria-hidden />
        <p className="font-mono text-sm" dir="ltr">
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </p>
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ExternalLink className="size-4" aria-hidden />
          {t("openInMaps")}
        </a>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-border">
      <div ref={containerRef} className="h-[60dvh] min-h-80 w-full bg-surface-2" role="region" aria-label={t("mapLabel", { plate: label ?? "" })} />
    </div>
  );
}
