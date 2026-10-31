"use client";

interface VehicleData {
  id: string;
  plate: string;
  status: "moving" | "stopped";
  speed?: string;
  location: string;
  time: string;
  haloColor: "cyan" | "green" | "red";
  top: string;
  left: string;
  rotation: number;
}

const VEHICLES: VehicleData[] = [
  {
    id: "v1",
    plate: "GJ01AB1234",
    status: "moving",
    speed: "65 km/h",
    location: "Chandkheda",
    time: "10:24 AM",
    haloColor: "cyan",
    top: "18%",
    left: "21%",
    rotation: -40,
  },
  {
    id: "v2",
    plate: "GJ01CD5678",
    status: "moving",
    speed: "48 km/h",
    location: "Naroda",
    time: "10:24 AM",
    haloColor: "green",
    top: "33%",
    left: "50%",
    rotation: -55,
  },
  {
    id: "v3",
    plate: "GJ01EF9012",
    status: "stopped",
    location: "Maninagar",
    time: "09:48 AM",
    haloColor: "red",
    top: "64%",
    left: "45%",
    rotation: -55,
  },
  {
    id: "v4",
    plate: "GJ01GH3456",
    status: "moving",
    speed: "72 km/h",
    location: "Vatva",
    time: "10:24 AM",
    haloColor: "green",
    top: "80%",
    left: "37%",
    rotation: 45,
  },
];

function TruckIcon({ rotation }: { rotation: number }) {
  return (
    <svg viewBox="0 0 48 48" className="size-11">
      <g transform={`translate(24,24) rotate(${rotation}) translate(-24,-24)`}>
        <ellipse cx="24" cy="32" rx="16" ry="8" fill="rgba(0,0,0,0.6)" />
        <rect x="13" y="16" width="22" height="22" rx="3" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />
        <path d="M 15,16 L 18,7 C 19,5 29,5 30,7 L 33,16 Z" fill="#cbd5e1" />
        <path d="M 17,14 L 19,8 C 20,7 28,7 29,8 L 31,14 Z" fill="#0f172a" />
        <rect x="18" y="5" width="12" height="4" rx="1.5" fill="#ffffff" />
      </g>
    </svg>
  );
}

function VanIcon({ rotation }: { rotation: number }) {
  return (
    <svg viewBox="0 0 48 48" className="size-11">
      <g transform={`translate(24,24) rotate(${rotation}) translate(-24,-24)`}>
        <ellipse cx="24" cy="30" rx="15" ry="7" fill="rgba(0,0,0,0.6)" />
        <rect x="15" y="11" width="18" height="26" rx="4.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
        <path d="M 17,16 C 17,13 31,13 31,16 L 31,19 L 17,19 Z" fill="#1e293b" />
        <line x1="18" y1="23" x2="30" y2="23" stroke="#cbd5e1" strokeWidth="1" />
        <line x1="18" y1="27" x2="30" y2="27" stroke="#cbd5e1" strokeWidth="1" />
      </g>
    </svg>
  );
}

function SedanIcon({ rotation }: { rotation: number }) {
  return (
    <svg viewBox="0 0 48 48" className="size-11">
      <g transform={`translate(24,24) rotate(${rotation}) translate(-24,-24)`}>
        <ellipse cx="24" cy="28" rx="14" ry="7" fill="rgba(0,0,0,0.6)" />
        <rect x="17" y="11" width="14" height="26" rx="4.5" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
        <path d="M 19,17 C 19,14 29,14 29,17 L 28,26 L 20,26 Z" fill="#0f172a" />
        <rect x="20" y="18" width="8" height="6.5" rx="1.5" fill="#ffffff" />
      </g>
    </svg>
  );
}

const haloStyles: Record<"cyan" | "green" | "red", { ring: string; bg: string }> = {
  cyan: { ring: "border-cyan-400/80", bg: "bg-cyan-400/20" },
  green: { ring: "border-emerald-400/80", bg: "bg-emerald-400/20" },
  red: { ring: "border-red-500/90", bg: "bg-red-500/25" },
};

const cardBorderStyles: Record<"cyan" | "green" | "red", string> = {
  cyan: "border-sky-400/30",
  green: "border-sky-400/30",
  red: "border-red-500/40",
};

function VehicleMarker({ vehicle }: { vehicle: VehicleData }) {
  const halo = haloStyles[vehicle.haloColor];
  const cardBorder = cardBorderStyles[vehicle.haloColor];
  const isStopped = vehicle.status === "stopped";

  const icon =
    vehicle.id === "v1" || vehicle.id === "v4" ? (
      <TruckIcon rotation={vehicle.rotation} />
    ) : vehicle.id === "v3" ? (
      <SedanIcon rotation={vehicle.rotation} />
    ) : (
      <VanIcon rotation={vehicle.rotation} />
    );

  return (
    <div
      className="absolute z-20"
      style={{ top: vehicle.top, left: vehicle.left }}
    >
      {/* Static Radar Halo Ring */}
      <div
        className={`absolute -inset-6 rounded-full border ${halo.ring} ${halo.bg} pointer-events-none`}
      />

      {/* Vehicle Icon */}
      <div className="relative z-10 drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)]">
        {icon}
      </div>

      {/* Telemetry Card */}
      <div
        className={`absolute left-10 -top-8 min-w-[145px] rounded-xl border ${cardBorder} bg-[#0a1925]/90 p-3 text-white backdrop-blur-md shadow-2xl`}
      >
        <div className="text-[13.5px] font-bold tracking-wider">{vehicle.plate}</div>
        {isStopped ? (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-red-400 font-semibold">
            <span className="size-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
            <span>Stopped</span>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-300">
            <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
            <span>
              Moving <strong className="text-white font-bold">{vehicle.speed}</strong>
            </span>
          </div>
        )}
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
          {/* Location pin */}
          <svg viewBox="0 0 24 24" className="size-3 stroke-current fill-none" strokeWidth="2">
            <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>{vehicle.location}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
          {/* Clock */}
          <svg viewBox="0 0 24 24" className="size-3 stroke-current fill-none" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>{vehicle.time}</span>
        </div>
      </div>
    </div>
  );
}

export function FleetMapMotion() {
  return (
    <div className="relative size-full overflow-hidden bg-[#06121c] select-none">
      {/* 1. Vector Map Layer (Ahmedabad Dark Satellite / Road Grid) */}
      <svg
        className="absolute inset-0 size-full block object-cover"
        viewBox="0 0 1000 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="mapVignetteNext" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#0c2333" stopOpacity="0.25" />
            <stop offset="80%" stopColor="#06121c" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#03090e" stopOpacity="1" />
          </radialGradient>

          <linearGradient id="riverGradNext" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0e3a54" />
            <stop offset="50%" stopColor="#144b6e" />
            <stop offset="100%" stopColor="#0a2c42" />
          </linearGradient>

          <filter id="neonGlowNext" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur1" />
            <feGaussianBlur stdDeviation="14" result="blur2" />
            <feMerge>
              <feMergeNode in="blur2" />
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Base dark canvas */}
        <rect width="1000" height="900" fill="#081724" />

        {/* Urban District Blocks */}
        <g opacity="0.16">
          <rect x="30" y="40" width="160" height="130" fill="#1e3a50" rx="6" />
          <rect x="220" y="30" width="190" height="150" fill="#1b3548" rx="8" />
          <rect x="440" y="50" width="230" height="120" fill="#183144" rx="8" />
          <rect x="710" y="60" width="250" height="190" fill="#1b384d" rx="10" />
          <rect x="50" y="220" width="220" height="180" fill="#1a3449" rx="8" />
          <rect x="420" y="240" width="200" height="200" fill="#1e3d54" rx="12" />
          <rect x="740" y="290" width="220" height="230" fill="#183244" rx="8" />
          <rect x="60" y="460" width="210" height="210" fill="#1a354b" rx="10" />
          <rect x="410" y="520" width="240" height="220" fill="#173042" rx="12" />
          <rect x="680" y="560" width="280" height="240" fill="#193347" rx="10" />
        </g>

        {/* Street Network Grids */}
        <g stroke="#142c3d" strokeWidth="1.2" opacity="0.75">
          <line x1="0" y1="80" x2="1000" y2="80" />
          <line x1="0" y1="140" x2="1000" y2="140" />
          <line x1="0" y1="210" x2="1000" y2="210" />
          <line x1="0" y1="280" x2="1000" y2="280" />
          <line x1="0" y1="360" x2="1000" y2="360" />
          <line x1="0" y1="430" x2="1000" y2="430" />
          <line x1="0" y1="510" x2="1000" y2="510" />
          <line x1="0" y1="590" x2="1000" y2="590" />
          <line x1="0" y1="670" x2="1000" y2="670" />
          <line x1="0" y1="750" x2="1000" y2="750" />
          <line x1="0" y1="820" x2="1000" y2="820" />

          <line x1="80" y1="0" x2="80" y2="900" />
          <line x1="160" y1="0" x2="160" y2="900" />
          <line x1="240" y1="0" x2="240" y2="900" />
          <line x1="330" y1="0" x2="330" y2="900" />
          <line x1="410" y1="0" x2="410" y2="900" />
          <line x1="500" y1="0" x2="500" y2="900" />
          <line x1="600" y1="0" x2="600" y2="900" />
          <line x1="690" y1="0" x2="690" y2="900" />
          <line x1="780" y1="0" x2="780" y2="900" />
          <line x1="870" y1="0" x2="870" y2="900" />
          <line x1="940" y1="0" x2="940" y2="900" />

          {/* Diagonal Arterials */}
          <line x1="20" y1="120" x2="380" y2="500" strokeWidth="1.8" />
          <line x1="600" y1="80" x2="980" y2="480" strokeWidth="1.8" />
          <line x1="150" y1="700" x2="520" y2="350" strokeWidth="1.8" />
          <line x1="400" y1="880" x2="850" y2="500" strokeWidth="1.8" />
        </g>

        {/* Sabarmati River */}
        <g>
          <path
            d="M 540,-20 C 530,120 480,220 410,320 C 370,380 360,450 375,520 C 390,600 440,680 430,780 C 420,840 400,890 380,920"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="32"
            strokeOpacity="0.12"
            strokeLinecap="round"
          />
          <path
            d="M 540,-20 C 530,120 480,220 410,320 C 370,380 360,450 375,520 C 390,600 440,680 430,780 C 420,840 400,890 380,920"
            fill="none"
            stroke="url(#riverGradNext)"
            strokeWidth="26"
            strokeLinecap="round"
          />
          <path
            d="M 542,-10 C 532,125 482,225 412,323 C 372,382 362,452 377,522 C 392,602 442,682 432,782 C 422,842 402,892 382,920"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            strokeOpacity="0.3"
            strokeDasharray="14 10"
          />
        </g>

        {/* Major Highways */}
        <g stroke="#1c4159" strokeLinecap="round">
          {/* S G Hwy */}
          <path d="M 170,-10 L 100,380 L 10,880" stroke="#225475" strokeWidth="5" />
          <path d="M 170,-10 L 100,380 L 10,880" stroke="#facc15" strokeWidth="1.2" strokeDasharray="8 6" opacity="0.6" />
          {/* East-West 147 */}
          <path d="M -10,120 Q 250,110 500,160 T 1010,170" stroke="#225475" strokeWidth="4.5" />
          {/* Ring Road 48 */}
          <path d="M 460,-10 Q 650,220 820,380 T 990,750" stroke="#225475" strokeWidth="4.5" />
          <path d="M 460,-10 Q 650,220 820,380 T 990,750" stroke="#facc15" strokeWidth="1.2" strokeDasharray="8 6" opacity="0.6" />
          {/* South Express NE 1 */}
          <path d="M -20,780 Q 250,750 550,720 T 1020,790" stroke="#225475" strokeWidth="4.5" />
        </g>

        {/* Highway Badges */}
        <g transform="translate(136, 74)">
          <rect width="24" height="15" rx="3" fill="#facc15" />
          <text x="12" y="11" fill="#0f172a" fontSize="8.5" fontWeight="800" textAnchor="middle">147</text>
        </g>
        <g transform="translate(118, 240) rotate(-78)">
          <text x="0" y="0" fill="#f1f5f9" fontSize="11" fontWeight="700" letterSpacing="1.5">S G Hwy</text>
        </g>
        <g transform="translate(108, 332)">
          <rect width="20" height="14" rx="3" fill="#facc15" />
          <text x="10" y="10.5" fill="#0f172a" fontSize="8.5" fontWeight="800" textAnchor="middle">48</text>
        </g>
        <g transform="translate(1, 740)">
          <rect width="28" height="14" rx="3" fill="#facc15" />
          <text x="14" y="10.5" fill="#0f172a" fontSize="8" fontWeight="800" textAnchor="middle">NE 1</text>
        </g>

        {/* Neighborhood Labels */}
        <g fill="#6488a4" fontSize="13" fontWeight="600" opacity="0.8">
          <text x="210" y="48">Chandkheda</text>
          <text x="370" y="152">Motera</text>
          <text x="190" y="295">Satellite</text>
          <text x="230" y="345">Vastrapur</text>
          <text x="350" y="318">Satellite</text>
          <text x="578" y="412">Naroda</text>
          <text x="532" y="915">Vatva</text>
        </g>

        {/* Central Landmark City Label */}
        <text x="365" y="432" fill="#547997" fontSize="20" fontWeight="700" letterSpacing="0.5" opacity="0.9">
          Ahmedabad
        </text>

        {/* Glowing GPS Neon Routes */}
        <g>
          <path
            d="M 230,195 C 255,230 280,310 285,340 C 290,380 340,480 435,595"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.4"
            filter="url(#neonGlowNext)"
          />
          <path
            d="M 230,195 C 255,230 280,310 285,340 C 290,380 340,480 435,595"
            fill="none"
            stroke="#06b6d4"
            strokeWidth="3"
            strokeLinecap="round"
          />

          <path
            d="M 285,340 C 350,440 430,620 445,630 C 460,610 470,410 505,350"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.4"
            filter="url(#neonGlowNext)"
          />
          <path
            d="M 285,340 C 350,440 430,620 445,630 C 460,610 470,410 505,350"
            fill="none"
            stroke="#00f2fe"
            strokeWidth="3"
            strokeLinecap="round"
          />

          <path
            d="M 505,350 C 470,420 460,520 445,635 C 420,680 380,750 375,815"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.4"
            filter="url(#neonGlowNext)"
          />
          <path
            d="M 505,350 C 470,420 460,520 445,635 C 420,680 380,750 375,815"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="2.6"
            strokeLinecap="round"
          />

          {/* Directional Flow Arrows */}
          <g fill="#22d3ee" opacity="0.9">
            <polygon points="248,222 242,213 255,217" />
            <polygon points="286,338 280,328 292,333" />
            <polygon points="466,380 475,372 472,385" />
            <polygon points="489,355 498,347 495,360" />
            <polygon points="432,605 440,615 444,601" />
          </g>
        </g>

        {/* Cinematic Vignette */}
        <rect width="1000" height="900" fill="url(#mapVignetteNext)" pointerEvents="none" />
      </svg>

      {/* 2. STATIC VEHICLE MARKERS */}
      {VEHICLES.map((vehicle) => (
        <VehicleMarker key={vehicle.id} vehicle={vehicle} />
      ))}

      {/* 3. BOTTOM-LEFT GLASSMORPHIC FEATURE SHOWCASE CARD — STATIC */}
      <aside className="absolute bottom-7 left-7 z-30 max-w-[420px] rounded-[24px] border border-white/10 bg-[#091924]/80 p-7 text-white backdrop-blur-xl shadow-[0_25px_60px_rgba(0,0,0,0.65)]">
        <div className="text-[10.5px] font-extrabold tracking-[2.5px] text-sky-400 uppercase">
          REAL-TIME TRACKING
        </div>
        <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold leading-[1.12] tracking-tight">
          <span className="block text-white">Track Your</span>
          <span className="block text-white">Vehicles</span>
          <span className="block bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            Anywhere
          </span>
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-slate-300">
          Live location, smart alerts and detailed reports for complete fleet management.
        </p>

        {/* 4 Feature Badges Grid */}
        <div className="mt-6 grid grid-cols-4 gap-2.5">
          {/* Live Tracking */}
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
            </div>
            <span className="text-[11px] font-semibold leading-tight text-slate-200">
              Live<br />Tracking
            </span>
          </div>

          {/* Instant Alerts */}
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-purple-500/40 bg-purple-500/15 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
              <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <span className="text-[11px] font-semibold leading-tight text-slate-200">
              Instant<br />Alerts
            </span>
          </div>

          {/* Detailed Reports */}
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-sky-500/40 bg-sky-500/15 text-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.2)]">
              <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <span className="text-[11px] font-semibold leading-tight text-slate-200">
              Detailed<br />Reports
            </span>
          </div>

          {/* Safe & Secure */}
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/15 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <span className="text-[11px] font-semibold leading-tight text-slate-200">
              Safe &amp;<br />Secure
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
