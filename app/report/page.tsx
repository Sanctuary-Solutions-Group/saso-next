"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import { Wind, Droplet, Zap, Info } from "lucide-react";

import { summarizeAir } from "@/lib/scoring/airSummary";
import { summarizeWater } from "@/lib/scoring/waterSummary";
import { summarizeEther } from "@/lib/scoring/etherSummary";

import { MetricRing } from "@/components/MetricRing";
import { computeWaterScore } from "@/lib/scoring/water";
import { computeEtherScore, etherLabel } from "@/lib/scoring/ether";
import {
  computeAirScore,
  co2Label,
  pm25Label,
  pm10Label,
  humidityCaution,
} from "@/lib/scoring/air";

// -----------------------------------------------------------------------------
// Sanctuary Solutions – LIVE Dashboard Report (Supabase-wired)
// Route: /app/report/page.tsx  (App Router)
// - Pulls latest property + rooms + measurements from Supabase
// - Uses *worst* (max) readings per metric across all rooms
// - Adds Room-by-Room Analysis section (Icon Cards)
// -----------------------------------------------------------------------------

// ====== CONFIG / THEME ======
const brand = {
  primary: "#2563eb", // blue-600
  accent: "#06b6d4", // cyan-500
  good: "#10b981", // green-500
  warn: "#f59e0b", // amber-500
  bad: "#ef4444", // red-500
};

// Houston reference values (can later be pulled from an external table)
const HOUSTON_REFERENCES = {
  pm25Avg: 12.0, // µg/m³ (regional annual baseline)
  pm10Avg: 40.0, // µg/m³ (illustrative baseline)
  co2IndoorTypical: 950, // ppm (WFH daytime typical)
  pm25Benchmark: 9.0, // EPA 2024 annual standard
  pm10Benchmark: 30.0, // SaSo comfort benchmark
  co2Benchmark: 800, // SaSo good threshold
};

// ====== THRESHOLDS (SaSo v1.1) ======
const THRESHOLDS: Record<string, { goodMax: number; fairMax: number; unit: string }> = {
  // AIR
  CO2: { goodMax: 800, fairMax: 1200, unit: "ppm" },
  PM25: { goodMax: 9, fairMax: 20, unit: "µg/m³" },
  PM10: { goodMax: 30, fairMax: 50, unit: "µg/m³" },
  VOCs: { goodMax: 200, fairMax: 500, unit: "ppb" },
  Humidity: { goodMax: 55, fairMax: 65, unit: "%" }, // treat >65 poor; 35–55 ideal in copy
  Temp: { goodMax: 75, fairMax: 80, unit: "°F" },
  // WATER
  TDS: { goodMax: 300, fairMax: 500, unit: "ppm" },
  Cl: { goodMax: 0.8, fairMax: 1.5, unit: "ppm" },
  pH: { goodMax: 8.5, fairMax: 9.5, unit: "" }, // Note: handle two-sided ideal in copy
  // ETHER (precautionary bands)
  MagField: { goodMax: 2.0, fairMax: 4.0, unit: "mG" },
  ElectricField: { goodMax: 0.5, fairMax: 1.5, unit: "V/m" },
  RF: { goodMax: 0.1, fairMax: 1.0, unit: "mW/m²" },
};

// Overall category weights
const OVERALL_WEIGHTS = {
  air: 0.45,
  water: 0.35,
  ether: 0.2,
};

// Metric metadata – defines grouping and display names
type MetricKey =
  | "CO2"
  | "PM25"
  | "PM10"
  | "VOCs"
  | "Humidity"
  | "Temp"
  | "TDS"
  | "Cl"
  | "pH"
  | "MagField"
  | "ElectricField"
  | "RF";

type CategoryKey = "air" | "water" | "ether";

// Raw measurement row from Supabase
interface MeasurementRow {
  id: string;
  property_id: string;
  room_id: string | null;
  category: string | null;
  metric: MetricKey | string;
  value: number;
  unit: string | null;
  notes: string | null;
  taken_at: string | null;
  created_at: string;
}

// Property row (aligned with current technician schema)
interface PropertyRow {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sqft: number | null;
  year_built: number | null;
  primary_contact_email: string | null;
  occupants_adults: number | null;
  occupants_children: number | null;
  occupants_animals: number | null;
  occupants_allergies: boolean | null;
  occupants_asthma: boolean | null;
  created_at: string;
}

// Room row
interface RoomRow {
  id: string;
  property_id: string;
  name: string;
  type: string | null;
  order_index: number | null;
  created_at: string;
}

// Utility to get category from metric key (fallback when category is missing)
function getCategoryFromMetric(metricKey: MetricKey): CategoryKey {
  switch (metricKey) {
    case "CO2":
    case "PM25":
    case "PM10":
    case "VOCs":
    case "Humidity":
    case "Temp":
      return "air";
    case "TDS":
    case "Cl":
    case "pH":
      return "water";
    case "MagField":
    case "ElectricField":
    case "RF":
      return "ether";
    default:
      return "air";
  }
}

// Pretty label mapping for client-facing UI
function prettyMetricLabel(metric: MetricKey | string): string {
  switch (metric as MetricKey) {
    case "CO2":
      return "CO₂";
    case "PM25":
      return "PM₂.₅";
    case "PM10":
      return "PM₁₀";
    case "VOCs":
      return "VOCs";
    case "Humidity":
      return "Humidity";
    case "Temp":
      return "Temperature";
    case "TDS":
      return "Total Dissolved Solids (TDS)";
    case "Cl":
      return "Free Chlorine";
    case "pH":
      return "pH";
    case "MagField":
      return "Magnetic Field (ELF)";
    case "ElectricField":
      return "Electric Field";
    case "RF":
      return "Radiofrequency (RF)";
    default:
      return typeof metric === "string" ? metric : String(metric);
  }
}

// Map raw value to a 0–100 metric score based on good/fair thresholds
function metricScore(value: number, goodMax: number, fairMax: number): number {
  if (value <= goodMax) return 100;
  if (value <= fairMax) {
    const t = (value - goodMax) / (fairMax - goodMax);
    return Math.round(100 - t * 40); // 100 → 60
  }
  const t = Math.min(1, (value - fairMax) / fairMax);
  return Math.round(60 - t * 60); // 60 → 0
}

// Helpers for status styles
function scoreToColor(score: number): string {
  if (score >= 85) return brand.good;
  if (score >= 70) return brand.accent;
  if (score >= 50) return brand.warn;
  return brand.bad;
}

function scoreToLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 45) return "Poor";
  return "Very Poor";
}

// Tooltip content for charts
const CustomTooltip = ({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  unit?: string;
}) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="font-semibold text-slate-800">{label}</div>
      {payload.map((entry, idx) => (
        <div key={idx} className="mt-1 flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color || entry.payload?.color || brand.primary }}
          />
          <span className="text-slate-700">
            {entry.name}: <span className="font-semibold">{entry.value}</span> {unit}
          </span>
        </div>
      ))}
    </div>
  );
};

// Reusable section wrapper with motion
const Section = ({
  id,
  label,
  title,
  children,
}: {
  id: string;
  label: string;
  title: string;
  children: React.ReactNode;
}) => (
  <section
    id={id}
    className="scroll-mt-24 border-t border-slate-200 bg-white/80 py-10 backdrop-blur-sm"
  >
    <div className="mx-auto max-w-6xl px-4">
      <div className="mb-6 flex items-baseline justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            {label}
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
            {title}
          </h2>
        </div>
      </div>
      {children}
    </div>
  </section>
);

// Expandable card for detailed metrics
const ExpandableCard = ({
  title,
  subtitle,
  score,
  statusLabel,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  score?: number;
  statusLabel?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <motion.div
      className="group rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
      layout
      transition={{ type: "spring", stiffness: 200, damping: 24 }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4"
      >
        <div className="flex flex-1 flex-col items-start text-left">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            {statusLabel && (
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                  score && score >= 80
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : score && score >= 60
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : score && score >= 45
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {statusLabel}
              </span>
            )}
          </div>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {typeof score === "number" && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-900">{score}</span>
            <span>/ 100</span>
          </div>
        )}
        <motion.div
          className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 group-hover:border-slate-300 group-hover:text-slate-700"
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        >
          <span className="text-xs">›</span>
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="pt-4 text-sm text-slate-700"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ type: "tween", duration: 0.22 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// Simple card
const Card = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={`rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md ${className}`}
  >
    {children}
  </div>
);

// Helper for tag-like chips
const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
    {children}
  </span>
);

// Room emoji icon helper (Option B – Icon Card vibe)
function roomIcon(room: RoomRow): string {
  const name = room.name.toLowerCase();
  if (name.includes("primary") || name.includes("master")) return "🛏️";
  if (name.includes("bed")) return "🛏️";
  if (name.includes("kitchen")) return "🍳";
  if (name.includes("living")) return "🛋️";
  if (name.includes("office")) return "💻";
  if (name.includes("nursery") || name.includes("kid")) return "🧸";
  if (name.includes("bath")) return "🚿";
  return "📍";
}

// Main Report Page
export default function ReportPage() {
  const [loading, setLoading] = useState(true);
  const [property, setProperty] = useState<PropertyRow | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Generate Magic Link for this property
  const generateLink = async () => {
    if (!property?.id) {
      alert("No property loaded yet.");
      return;
    }

    try {
      const res = await fetch("/api/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: property.id }),
      });

      const out = await res.json();

      if (!out.ok) {
        alert("Failed to generate link.");
        return;
      }

      await navigator.clipboard.writeText(out.link);
      alert(`Share link copied!\n\n${out.link}`);
    } catch (err) {
      console.error(err);
      alert("Error generating share link.");
    }
  };

  // Fetch property + rooms + measurements (supports magic link)
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      // 1. Read token from URL
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      let propertyIdToLoad: string | null = null;

      if (token) {
        // 2. Validate token
        const { data: accessRow, error: accessError } = await supabase
          .from("report_access")
          .select("property_id, expires_at")
          .eq("token", token)
          .single();

        if (accessError || !accessRow) {
          setError("This link is invalid or expired.");
          setLoading(false);
          return;
        }

        // 3. Check expiration
        if (accessRow.expires_at && new Date(accessRow.expires_at) < new Date()) {
          setError("This link has expired.");
          setLoading(false);
          return;
        }

        propertyIdToLoad = accessRow.property_id;
      }

      // 4. If no token, fallback to latest property
      if (!propertyIdToLoad) {
        const { data: propertyRows, error: propertyError } = await supabase
          .from("property")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1);

        if (propertyError || !propertyRows?.[0]) {
          setError("Unable to load latest property.");
          setLoading(false);
          return;
        }

        const latestProperty = propertyRows[0] as PropertyRow;
        setProperty(latestProperty);
        propertyIdToLoad = latestProperty.id;
      } else {
        // 5. Load property by ID (magic link path)
        const { data: propertyRow, error: propertyErr } = await supabase
          .from("property")
          .select("*")
          .eq("id", propertyIdToLoad)
          .single();

        if (propertyErr || !propertyRow) {
          setError("Unable to load property.");
          setLoading(false);
          return;
        }

        setProperty(propertyRow as PropertyRow);
      }

      // 6. Load measurements for the chosen property
      const { data: measurementRows, error: measurementError } = await supabase
        .from("measurement")
        .select("*")
        .eq("property_id", propertyIdToLoad);

      if (measurementError) {
        console.error(measurementError);
        setError("Unable to load measurements for this property.");
        setLoading(false);
        return;
      }

      setMeasurements((measurementRows ?? []) as MeasurementRow[]);

      // 7. Load rooms for this property
      const { data: roomRows, error: roomError } = await supabase
        .from("room")
        .select("*")
        .eq("property_id", propertyIdToLoad)
        .order("order_index", { ascending: true });

      if (roomError) {
        console.error(roomError);
        setRooms([]);
      } else {
        setRooms((roomRows ?? []) as RoomRow[]);
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  // ========= METRIC AGGREGATION (MAX ACROSS ROOMS) =========
  const M = useMemo(() => {
    // Start with null (no reading); later convert to 0 for scoring
    const base: Record<MetricKey, number | null> = {
      CO2: null,
      PM25: null,
      PM10: null,
      VOCs: null,
      Humidity: null,
      Temp: null,
      TDS: null,
      Cl: null,
      pH: null,
      MagField: null,
      ElectricField: null,
      RF: null,
    };

    for (const row of measurements) {
      const key = row.metric as MetricKey;
      if (!(key in base)) continue;
      const current = base[key];
      // "Most concerning" = highest value, for now (we can refine per-metric later if needed)
      if (current === null || row.value > current) {
        base[key] = row.value;
      }
    }

    const result: Record<MetricKey, number> = {
      CO2: 0,
      PM25: 0,
      PM10: 0,
      VOCs: 0,
      Humidity: 0,
      Temp: 0,
      TDS: 0,
      Cl: 0,
      pH: 0,
      MagField: 0,
      ElectricField: 0,
      RF: 0,
    };

    (Object.keys(base) as MetricKey[]).forEach((k) => {
      result[k] = base[k] ?? 0;
    });

    return result;
  }, [measurements]);

  const metricScores = useMemo(() => {
    const s: Record<MetricKey, number> = {
      CO2: 0,
      PM25: 0,
      PM10: 0,
      VOCs: 0,
      Humidity: 0,
      Temp: 0,
      TDS: 0,
      Cl: 0,
      pH: 0,
      MagField: 0,
      ElectricField: 0,
      RF: 0,
    };

    (Object.keys(THRESHOLDS) as MetricKey[]).forEach((k) => {
      const val = M[k];
      if (typeof val !== "number") return;
      const { goodMax, fairMax } = THRESHOLDS[k];
      s[k] = metricScore(val, goodMax, fairMax);
    });

    return s;
  }, [M]);

  // Category scores (still using your scoring engines)
  const airScore = useMemo(
    () =>
      computeAirScore({
        co2: M.CO2 ?? 0,
        pm25: M.PM25 ?? 0,
        pm10: M.PM10 ?? 0,
      }),
    [M]
  );

  const waterScore = useMemo(
    () =>
      computeWaterScore({
        tds: M.TDS,
        cl: M.Cl,
        ph: M.pH,
      }),
    [M]
  );

  const etherScore = useMemo(
    () =>
      computeEtherScore({
        mag: M.MagField ?? 0,
        electric: M.ElectricField ?? 0,
        rf: M.RF ?? 0,
      }),
    [M]
  );

  const overallScore = useMemo(
    () =>
      Math.round(
        airScore * OVERALL_WEIGHTS.air +
          waterScore * OVERALL_WEIGHTS.water +
          etherScore * OVERALL_WEIGHTS.ether
      ),
    [airScore, waterScore, etherScore]
  );

  // Comparison data for charts
  const pm25Compare = useMemo(
    () => [
      { name: "Your Home", value: M.PM25 ?? 0, color: brand.primary },
      { name: "Houston Avg", value: HOUSTON_REFERENCES.pm25Avg, color: "#64748b" },
      { name: "SaSo Target", value: HOUSTON_REFERENCES.pm25Benchmark, color: "#22c55e" },
    ],
    [M.PM25]
  );

  const pm10Compare = useMemo(
    () => [
      { name: "Your Home", value: M.PM10 ?? 0, color: brand.primary },
      { name: "Houston Avg", value: HOUSTON_REFERENCES.pm10Avg, color: "#64748b" },
      { name: "SaSo Target", value: HOUSTON_REFERENCES.pm10Benchmark, color: "#22c55e" },
    ],
    [M.PM10]
  );

  const co2Compare = useMemo(
    () => [
      { name: "Your Home", value: M.CO2 ?? 0, color: brand.primary },
      { name: "Typical Indoor", value: HOUSTON_REFERENCES.co2IndoorTypical, color: "#64748b" },
      { name: "SaSo Target", value: HOUSTON_REFERENCES.co2Benchmark, color: "#22c55e" },
    ],
    [M.CO2]
  );

  // Group measurements by room for Room-by-Room Analysis
  const measurementsByRoom = useMemo(() => {
    const map: Record<string, MeasurementRow[]> = {};
    for (const m of measurements) {
      const roomId = m.room_id;
      if (!roomId) continue;
      if (!map[roomId]) map[roomId] = [];
      map[roomId].push(m);
    }
    return map;
  }, [measurements]);

  const unassignedMeasurements = useMemo(
    () => measurements.filter((m) => !m.room_id),
    [measurements]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            <p className="text-sm text-slate-500">
              Building your Home Health Report…
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4">
          <Card className="max-w-md text-center">
            <h1 className="text-lg font-semibold text-slate-900">
              No properties found
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Once you complete your first on-site assessment, your full Home
              Health Report will appear here.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  const humidityFlag = humidityCaution(M.Humidity ?? 0);

  const airLabel = scoreToLabel(airScore);
  const waterLabel = scoreToLabel(waterScore);
  const etherStatusLabel = scoreToLabel(etherScore);
  const overallLabel = scoreToLabel(overallScore);

  const airSummary = summarizeAir(M);
  const waterSummary = summarizeWater(M);
  const etherSummary = summarizeEther(M);

  const co2Status = co2Label(M.CO2 ?? 0);
  const pm25Status = pm25Label(M.PM25 ?? 0);
  const pm10Status = pm10Label(M.PM10 ?? 0);

  const addressLine = property.address || "";
  const cityLine = [property.city, property.state, property.zip]
    .filter(Boolean)
    .join(", ");

  const occupantChips: string[] = [];
  if (property.occupants_adults != null) {
    occupantChips.push(
      `${property.occupants_adults} adult${
        property.occupants_adults === 1 ? "" : "s"
      }`
    );
  }
  if (property.occupants_children != null) {
    occupantChips.push(
      `${property.occupants_children} child${
        property.occupants_children === 1 ? "" : "ren"
      }`
    );
  }
  if (property.occupants_animals != null) {
    occupantChips.push(
      `${property.occupants_animals} pet${
        property.occupants_animals === 1 ? "" : "s"
      }`
    );
  }
  if (property.occupants_allergies) {
    occupantChips.push("Allergies noted");
  }
  if (property.occupants_asthma) {
    occupantChips.push("Asthma present");
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white">
              Sa
            </div>
            <div className="flex flex-col">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Sanctuary Solutions
              </div>
              <div className="text-[13px] font-medium tracking-tight text-slate-800">
                Home Health Engineering Report
              </div>
            </div>
          </div>
          <nav className="hidden items-center gap-4 text-xs text-slate-500 md:flex">
            <a href="#snapshot" className="hover:text-slate-900">
              Snapshot
            </a>
            <a href="#expandables" className="hover:text-slate-900">
              Metrics
            </a>
            <a href="#rooms" className="hover:text-slate-900">
              Rooms
            </a>
            <a href="#compare" className="hover:text-slate-900">
              Compare
            </a>
            <a href="#action" className="hover:text-slate-900">
              Action
            </a>
          </nav>
        </div>
      </header>

      {/* SNAPSHOT SECTION */}
      <Section id="snapshot" label="Snapshot" title="Your latest home health profile">
        <div className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* Left: Address + summary */}
          <Card className="relative overflow-hidden">
            <motion.div
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sky-100"
              initial={{ opacity: 0, scale: 0.8, x: 40, y: -20 }}
              animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              transition={{
                type: "spring",
                stiffness: 120,
                damping: 22,
                delay: 0.15,
              }}
            />
            <div className="relative space-y-4">
              {/* Share Link Button */}
              <button
                onClick={generateLink}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white transition hover:bg-blue-700"
              >
                Generate Share Link
              </button>

              <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">
                    Home Health Report
                  </h1>
                  <p className="mt-1 text-slate-600">
                    Most recent property ·{" "}
                    {new Date(property.created_at).toLocaleDateString()} ·{" "}
                    {property.city ?? ""}
                    {property.city ? ", " : ""}
                    {property.state ?? ""}
                  </p>
                  <p className="mt-2 text-slate-700">
                    Categories tested: <strong>Air</strong> ·{" "}
                    <strong>Water</strong> · <strong>Ether</strong>
                  </p>
                </div>

                <Card className="md:min-w-[340px]">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Overall Home Health
                  </div>
                  <div className="mt-2 flex items-end justify-between">
                    <motion.div
                      className="text-4xl font-bold"
                      style={{
                        color:
                          overallScore >= 85
                            ? brand.good
                            : overallScore >= 70
                            ? brand.accent
                            : overallScore >= 50
                            ? brand.warn
                            : brand.bad,
                      }}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 160,
                        damping: 20,
                        delay: 0.1,
                      }}
                    >
                      {overallScore}
                    </motion.div>
                    <div className="ml-3 flex flex-col items-end text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: scoreToColor(overallScore) }}
                        />
                        {overallLabel}
                      </span>
                      <span className="mt-1 text-[11px] text-slate-500">
                        Weighted blend of Air, Water, and Ether.
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                    <div className="flex flex-col rounded-lg bg-slate-50 px-2.5 py-1.5">
                      <span className="text-[10px] uppercase tracking-wide text-slate-500">
                        Air
                      </span>
                      <span className="mt-1 text-sm font-semibold text-slate-900">
                        {airScore}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {airLabel}
                      </span>
                    </div>
                    <div className="flex flex-col rounded-lg bg-slate-50 px-2.5 py-1.5">
                      <span className="text-[10px] uppercase tracking-wide text-slate-500">
                        Water
                      </span>
                      <span className="mt-1 text-sm font-semibold text-slate-900">
                        {waterScore}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {waterLabel}
                      </span>
                    </div>
                    <div className="flex flex-col rounded-lg bg-slate-50 px-2.5 py-1.5">
                      <span className="text-[10px] uppercase tracking-wide text-slate-500">
                        Ether
                      </span>
                      <span className="mt-1 text-sm font-semibold text-slate-900">
                        {etherScore}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {etherLabel(etherScore)}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="space-y-1 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Property
                  </div>
                  <div className="text-[13px] font-medium text-slate-900">
                    {addressLine || "Address on file"}
                  </div>
                  <div className="text-[12px] text-slate-500">
                    {cityLine || "City, State"}
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Household
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[12px] text-slate-600">
                    {occupantChips.length > 0 ? (
                      occupantChips.map((c) => <Chip key={c}>{c}</Chip>)
                    ) : (
                      <span className="text-slate-400">
                        Household details not provided.
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Flags
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[12px]">
                    {humidityFlag && (
                      <Chip>
                        Humidity outside 40–60%
                        <span className="ml-1 text-[10px] text-slate-400">
                          (comfort + mold risk)
                        </span>
                      </Chip>
                    )}
                    {M.CO2 > 1200 && (
                      <Chip>
                        Elevated CO₂ during measurement
                        <span className="ml-1 text-[10px] text-slate-400">
                          (ventilation recommended)
                        </span>
                      </Chip>
                    )}
                    {M.PM25 > 20 && (
                      <Chip>
                        Elevated fine particles
                        <span className="ml-1 text-[10px] text-slate-400">
                          (filtration recommended)
                        </span>
                      </Chip>
                    )}
                    {!humidityFlag && M.CO2 <= 1200 && M.PM25 <= 20 && (
                      <span className="text-[12px] text-slate-400">
                        No significant flags at time of testing.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Right: Rings */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Category Scores
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Higher scores indicate better conditions for long-term health
                  and comfort.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {/* AIR */}
              <div className="flex flex-col items-center gap-2 pt-2">
                {/* Fixed-height ring wrapper ensures alignment */}
                <div className="h-[110px] flex items-start justify-center">
                  <MetricRing
                    percent={airScore}
                    icon={<Wind size={22} />}
                    size={80}
                  />
                </div>
                <span className="text-[11px] text-slate-500">{airLabel}</span>
                <span className="text-[11px] text-slate-400 italic text-center">
                  {airSummary}
                </span>
              </div>

              {/* WATER */}
              <div className="flex flex-col items-center gap-2 pt-2">
                <div className="h-[110px] flex items-start justify-center">
                  <MetricRing
                    percent={waterScore}
                    icon={<Droplet size={22} />}
                    size={80}
                  />
                </div>
                <span className="text-[11px] text-slate-500">{waterLabel}</span>
                <span className="text-[11px] text-slate-400 italic text-center">
                  {waterSummary}
                </span>
              </div>

              {/* ETHER */}
              <div className="flex flex-col items-center gap-2 pt-2">
                <div className="h-[110px] flex items-start justify-center">
                  <MetricRing
                    percent={etherScore}
                    icon={<Zap size={22} />}
                    size={80}
                  />
                </div>
                <span className="text-[11px] text-slate-500">
                  {etherLabel(etherScore)}
                </span>
                <span className="text-[11px] text-slate-400 italic text-center">
                  {etherSummary}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </Section>

      {/* DETAILED METRICS SECTION */}
      <Section
        id="expandables"
        label="Detailed View"
        title="How your home performed by metric"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {/* AIR */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Air
              </div>

              <span className="text-slate-400">·</span>

              <a
                href="https://www.airnow.gov/?city=Houston&state=TX&zipcode=77007"
                target="_blank"
                rel="noopener noreferrer"
                className="relative group flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
              >
                <span className="shadow-[0_0_2px_rgba(0,0,0,0.1)]">
                  Local Air Risks
                </span>

                <Info
                  size={13}
                  className="text-blue-600 group-hover:text-blue-700"
                />

                <div className="absolute left-0 top-5 z-20 w-56 rounded-md bg-slate-900 p-2 text-[11px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  Outdoor pollution, pollen, and ventilation patterns all
                  influence indoor CO₂ and particulate levels. Click to view
                  local environmental conditions.
                </div>
              </a>
            </div>

            <ExpandableCard
              title="CO₂ (Carbon Dioxide)"
              subtitle="Impacts alertness, decision-making, and sleep quality."
              score={metricScores.CO2}
              statusLabel={co2Status}
              defaultOpen
            >
              <p>
                Your snapshot reading (worst room) was{" "}
                <span className="font-semibold text-slate-900">
                  {M.CO2?.toFixed(0) ?? "—"} ppm
                </span>
                .{" "}
                <span className="font-medium text-slate-800">
                  {co2Status}.
                </span>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                <li>
                  <strong>{"≤ 700 ppm"}</strong> is considered fresh,
                  outdoor-like air where most people feel sharp and clear.
                </li>
                <li>
                  <strong>700–1000 ppm</strong> is typical of occupied indoor
                  spaces with decent ventilation.
                </li>
                <li>
                  <strong>Above ~1200 ppm</strong>, people often report
                  stuffiness, fatigue, and reduced focus.
                </li>
              </ul>
              <p className="mt-2 text-sm text-slate-700">
                Sustained CO₂ above 1500–2000 ppm can impair complex thinking
                and make spaces feel oppressive. The goal is to keep your daily
                peaks closer to{" "}
                <span className="font-medium text-slate-900">
                  {HOUSTON_REFERENCES.co2Benchmark} ppm
                </span>{" "}
                or below during active use.
              </p>
            </ExpandableCard>

            <ExpandableCard
              title="PM₂.₅ (Fine Particles)"
              subtitle="Tiny particles that can reach deep into the lungs."
              score={metricScores.PM25}
              statusLabel={pm25Status}
            >
              <p>
                Your PM₂.₅ reading (worst room) was{" "}
                <span className="font-semibold text-slate-900">
                  {M.PM25 ? `${M.PM25.toFixed(1)} µg/m³` : "—"}
                </span>
                .{" "}
                <span className="font-medium text-slate-800">
                  {pm25Status} overall.
                </span>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                <li>
                  <strong>0–9 µg/m³</strong>: excellent, aligned with the
                  latest WHO annual guideline.
                </li>
                <li>
                  <strong>9–20 µg/m³</strong>: moderate; common in
                  traffic-exposed or cooking-heavy spaces.
                </li>
                <li>
                  <strong>{" > 20 µg/m³"}</strong>: elevated; long-term
                  exposure is associated with respiratory and cardiovascular
                  risk.
                </li>
              </ul>
              <p className="mt-2 text-sm text-slate-700">
                Sources include cooking, candles, outdoor pollution, and poorly
                filtered HVAC. We generally recommend kitchen exhaust use and a
                HEPA-grade purifier if levels are regularly above{" "}
                <span className="font-medium text-slate-900">
                  10–15 µg/m³
                </span>
                .
              </p>
            </ExpandableCard>

            <ExpandableCard
              title="PM₁₀ (Coarse Particles)"
              subtitle="Larger particles linked to irritation and dust load."
              score={metricScores.PM10}
              statusLabel={pm10Status}
            >
              <p>
                Your PM₁₀ reading (worst room) was{" "}
                <span className="font-semibold text-slate-900">
                  {M.PM10 ? `${M.PM10.toFixed(1)} µg/m³` : "—"}
                </span>
                .{" "}
                <span className="font-medium text-slate-800">
                  {pm10Status} overall.
                </span>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                <li>
                  <strong>≤ 30 µg/m³</strong>: excellent for an indoor setting.
                </li>
                <li>
                  <strong>30–50 µg/m³</strong>: moderate; expect more visible
                  dust and potential irritation for sensitive individuals.
                </li>
                <li>
                  <strong>{"> 50 µg/m³"}</strong>: high; often seen in dusty,
                  high-traffic, or renovation-adjacent areas.
                </li>
              </ul>
              <p className="mt-2 text-sm text-slate-700">
                Elevated PM₁₀ can be a sign of resuspended dust, open windows
                near busy roads, or inadequate filtration on your HVAC system.
              </p>
            </ExpandableCard>

            <ExpandableCard
              title="Temp & Humidity"
              subtitle="Comfort envelope and mold risk factors."
              score={metricScores.Humidity}
              statusLabel={
                humidityFlag
                  ? "Outside optimal range"
                  : metricScores.Humidity >= 80
                  ? "Comfortable"
                  : "Monitor"
              }
            >
              <p>
                At the time of testing (worst-room snapshot), indoor temperature
                was{" "}
                <span className="font-semibold text-slate-900">
                  {M.Temp ? `${M.Temp.toFixed(1)} °F` : "—"}
                </span>{" "}
                and relative humidity was{" "}
                <span className="font-semibold text-slate-900">
                  {M.Humidity ? `${M.Humidity.toFixed(1)}%` : "—"}
                </span>
                .
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                <li>
                  <strong>40–60% humidity</strong> is typically best for
                  comfort, respiratory health, and mold prevention.
                </li>
                <li>
                  Below <strong>40%</strong>, air can feel dry and irritating
                  to the eyes and airways.
                </li>
                <li>
                  Above <strong>60%</strong>, the risk of dust mites and mold
                  growth increases over time.
                </li>
              </ul>
              <p className="mt-2 text-sm text-slate-700">
                We look at humidity in context with your building envelope, HVAC
                settings, and local climate to balance comfort with long-term
                durability.
              </p>
            </ExpandableCard>
          </div>

          {/* WATER */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Water
              </div>

              <span className="text-slate-400">·</span>

              <a
                href="https://www.houstonpublicworks.org/sites/g/files/nwywnm456/files/doc/003_2024_houston_water_quality_report_08.13.2025.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="relative group flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
              >
                <span className="shadow-[0_0_2px_rgba(0,0,0,0.1)]">
                  Local Water Risks
                </span>

                <Info
                  size={13}
                  className="text-blue-600 group-hover:text-blue-700"
                />

                <div className="absolute left-0 top-5 z-20 w-56 rounded-md bg-slate-900 p-2 text-[11px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  Municipal water varies by source, treatment method, and
                  distribution system age. Learn the key factors that influence
                  chlorine levels, minerals, taste, and potential contaminants
                  in Houston’s network.
                </div>
              </a>
            </div>

            <ExpandableCard
              title="Total Dissolved Solids (TDS)"
              subtitle="An overall indicator of dissolved minerals and contaminants."
              score={metricScores.TDS}
              statusLabel={
                M.TDS <= 150
                  ? "Excellent"
                  : M.TDS <= 300
                  ? "Good"
                  : M.TDS <= 500
                  ? "High minerals"
                  : "Very high"
              }
              defaultOpen
            >
              <p>
                Your TDS reading (worst tap) was{" "}
                <span className="font-semibold text-slate-900">
                  {M.TDS ? `${M.TDS.toFixed(0)} ppm` : "—"}
                </span>
                .
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                <li>
                  <strong>{"< 150 ppm"}</strong>: very low mineral content,
                  similar to many filtration systems.
                </li>
                <li>
                  <strong>150–300 ppm</strong>: typical for municipal tap water.
                </li>
                <li>
                  <strong>{"> 300 ppm"}</strong>: higher mineral load; may
                  impact taste, scaling, and appliance life.
                </li>
              </ul>
              <p className="mt-2 text-sm text-slate-700">
                TDS doesn&apos;t specify exactly what&apos;s present, but it&apos;s
                a valuable screening metric. For elevated readings, we often
                recommend point-of-use filtration with carbon + sediment stages,
                and in some cases reverse osmosis.
              </p>
            </ExpandableCard>

            <ExpandableCard
              title="Chlorine"
              subtitle="Disinfection byproduct with taste and respiratory impact."
              score={metricScores.Cl}
              statusLabel={
                M.Cl <= 0.5
                  ? "Low"
                  : M.Cl <= 1.5
                  ? "Typical municipal"
                  : M.Cl <= 3
                  ? "High"
                  : "Very high"
              }
            >
              <p>
                Your chlorine level (worst tap) was{" "}
                <span className="font-semibold text-slate-900">
                  {M.Cl ? `${M.Cl.toFixed(2)} ppm` : "—"}
                </span>
                .
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                <li>
                  <strong>0.2–1.0 ppm</strong> is common for municipal systems.
                </li>
                <li>
                  Elevated chlorine can dry skin and hair and aggravate
                  sensitive airways, especially during showering.
                </li>
              </ul>
              <p className="mt-2 text-sm text-slate-700">
                Carbon filtration is highly effective at reducing chlorine,
                improving both taste and shower experience.
              </p>
            </ExpandableCard>

            <ExpandableCard
              title="pH"
              subtitle="Acid/alkaline balance of your tap water."
              score={metricScores.pH}
              statusLabel={
                M.pH >= 6.5 && M.pH <= 8.5
                  ? "Ideal range"
                  : M.pH
                  ? "Outside recommended range"
                  : "Not measured"
              }
            >
              <p>
                Your measured pH (worst tap) was{" "}
                <span className="font-semibold text-slate-900">
                  {M.pH ? M.pH.toFixed(2) : "—"}
                </span>
                .
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                <li>
                  <strong>6.5–8.5</strong> is generally considered acceptable
                  for drinking water from a corrosivity and taste perspective.
                </li>
                <li>
                  Significantly low pH can contribute to pipe corrosion; very
                  high pH can cause scaling and off taste.
                </li>
              </ul>
              <p className="mt-2 text-sm text-slate-700">
                pH is interpreted alongside TDS, hardness, and plumbing
                materials to decide whether treatment or corrosion control is
                appropriate.
              </p>
            </ExpandableCard>
          </div>

          {/* ETHER */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Ether
              </div>

              <span className="text-slate-400">·</span>

              <a
                href="https://www.antennasearch.com/HTML/search/search.php?address=77007"
                target="_blank"
                rel="noopener noreferrer"
                className="relative group flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
              >
                <span className="shadow-[0_0_2px_rgba(0,0,0,0.1)]">
                  Local EMF Context
                </span>

                <Info
                  size={13}
                  className="text-blue-600 group-hover:text-blue-700"
                />

                <div className="absolute left-0 top-5 z-20 w-56 rounded-md bg-slate-900 p-2 text-[11px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  Nearby cell towers, building wiring patterns, and power
                  infrastructure all contribute to background EMF exposure.
                  Click to view the electromagnetic environment around your
                  home.
                </div>
              </a>
            </div>

            <ExpandableCard
              title="Magnetic Fields (ELF)"
              subtitle="Extremely low frequency fields from wiring and large appliances."
              score={metricScores.MagField}
              statusLabel={
                M.MagField <= 1
                  ? "Very low"
                  : M.MagField <= 2
                  ? "Low"
                  : M.MagField <= 4
                  ? "Moderate"
                  : "Elevated"
              }
              defaultOpen
            >
              <p>
                Snapshot magnetic field (worst spot) was{" "}
                <span className="font-semibold text-slate-900">
                  {M.MagField ? `${M.MagField.toFixed(2)} mG` : "—"}
                </span>
                .
              </p>
              <p className="mt-2 text-sm text-slate-700">
                While there are no universally accepted residential limits,
                many precautionary guidelines aim to keep long-term sleeping
                areas below about <strong>1–2 mG</strong> when feasible.
              </p>
            </ExpandableCard>

            <ExpandableCard
              title="Electric Fields"
              subtitle="Voltage-related fields from wiring, cords, and some devices."
              score={metricScores.ElectricField}
              statusLabel={
                M.ElectricField <= 0.5
                  ? "Very low"
                  : M.ElectricField <= 1
                  ? "Low"
                  : M.ElectricField <= 2
                  ? "Moderate"
                  : "Elevated"
              }
            >
              <p>
                Electric field at the time of testing (worst spot) was{" "}
                <span className="font-semibold text-slate-900">
                  {M.ElectricField
                    ? `${M.ElectricField.toFixed(2)} V/m`
                    : "—"}
                </span>
                .
              </p>
              <p className="mt-2 text-sm text-slate-700">
                We focus most remediation on sleeping areas and high-use
                workspaces, using distance, wiring optimization, and device
                placement adjustments.
              </p>
            </ExpandableCard>

            <ExpandableCard
              title="Radiofrequency (RF)"
              subtitle="Wireless signals from Wi-Fi, phones, and nearby infrastructure."
              score={metricScores.RF}
              statusLabel={
                M.RF <= 0.05
                  ? "Very low"
                  : M.RF <= 0.1
                  ? "Low"
                  : M.RF <= 1
                  ? "Moderate"
                  : "Elevated"
              }
            >
              <p>
                RF power density snapshot (worst spot) was{" "}
                <span className="font-semibold text-slate-900">
                  {M.RF ? `${M.RF.toFixed(3)} mW/m²` : "—"}
                </span>
                .
              </p>
              <p className="mt-2 text-sm text-slate-700">
                We interpret RF in context: proximity to routers and devices,
                sleep locations, and your sensitivity profile. When requested,
                we prioritize reducing nighttime and long-duration exposures.
              </p>
            </ExpandableCard>
          </div>
        </div>
      </Section>

      {/* ROOM-BY-ROOM ANALYSIS SECTION */}
      <Section
        id="rooms"
        label="Room-by-room Analysis"
        title="Where issues are showing up in your home"
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => {
            const roomMs = measurementsByRoom[room.id] || [];
            const categories = new Set<CategoryKey>();

            roomMs.forEach((m) => {
              if (m.category) {
                const lower = m.category.toLowerCase();
                if (lower === "air" || lower === "water" || lower === "ether") {
                  categories.add(lower as CategoryKey);
                }
              } else {
                const key = m.metric as MetricKey;
                categories.add(getCategoryFromMetric(key));
              }
            });

            const hasData = roomMs.length > 0;

            return (
              <Card key={room.id} className="relative overflow-hidden">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/90 text-sm">
                    {roomIcon(room)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {room.name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Room-by-room snapshot
                    </div>
                  </div>
                </div>

                <div className="mb-2 flex flex-wrap gap-1.5 text-[10px] text-slate-600">
                  {categories.has("air") && <Chip>Air metrics</Chip>}
                  {categories.has("water") && <Chip>Water metrics</Chip>}
                  {categories.has("ether") && <Chip>Ether metrics</Chip>}
                  {!hasData && (
                    <span className="text-[11px] text-slate-400">
                      No measurements captured yet.
                    </span>
                  )}
                </div>

                {hasData && (
                  <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50/60">
                    <table className="min-w-full border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-100 text-left text-[10px] text-slate-500">
                          <th className="border-b border-slate-200 px-2 py-1">
                            Metric
                          </th>
                          <th className="border-b border-slate-200 px-2 py-1">
                            Value
                          </th>
                          <th className="border-b border-slate-200 px-2 py-1">
                            Unit
                          </th>
                          <th className="border-b border-slate-200 px-2 py-1">
                            Time
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {roomMs.map((m) => {
                          const t = m.taken_at || m.created_at;
                          const timeLabel = t
                            ? new Date(t).toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                              })
                            : "—";

                          const label = prettyMetricLabel(m.metric);

                          return (
                            <tr key={m.id} className="bg-white odd:bg-slate-50/80">
                              <td className="border-b border-slate-100 px-2 py-1">
                                {label}
                              </td>
                              <td className="border-b border-slate-100 px-2 py-1">
                                {m.value}
                              </td>
                              <td className="border-b border-slate-100 px-2 py-1">
                                {m.unit || "—"}
                              </td>
                              <td className="border-b border-slate-100 px-2 py-1 text-[10px] text-slate-500">
                                {timeLabel}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}

          {/* Unassigned / legacy measurements */}
          {unassignedMeasurements.length > 0 && (
            <Card className="relative overflow-hidden">
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/90 text-sm">
                  🏠
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Whole-home / Unassigned
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Measurements not tied to a specific room.
                  </div>
                </div>
              </div>

              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50/60">
                <table className="min-w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-left text-[10px] text-slate-500">
                      <th className="border-b border-slate-200 px-2 py-1">
                        Metric
                      </th>
                      <th className="border-b border-slate-200 px-2 py-1">
                        Value
                      </th>
                      <th className="border-b border-slate-200 px-2 py-1">
                        Unit
                      </th>
                      <th className="border-b border-slate-200 px-2 py-1">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {unassignedMeasurements.map((m) => {
                      const t = m.taken_at || m.created_at;
                      const timeLabel = t
                        ? new Date(t).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "—";

                      const label = prettyMetricLabel(m.metric);

                      return (
                        <tr key={m.id} className="bg-white odd:bg-slate-50/80">
                          <td className="border-b border-slate-100 px-2 py-1">
                            {label}
                          </td>
                          <td className="border-b border-slate-100 px-2 py-1">
                            {m.value}
                          </td>
                          <td className="border-b border-slate-100 px-2 py-1">
                            {m.unit || "—"}
                          </td>
                          <td className="border-b border-slate-100 px-2 py-1 text-[10px] text-slate-500">
                            {timeLabel}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </Section>

      {/* COMPARISON SECTION */}
      <Section id="compare" label="Context" title="How your air compares">
        <div className="grid gap-6 md:grid-cols-3">
          {/* PM2.5 */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  PM₂.₅
                </div>
                <p className="text-xs text-slate-500">
                  Fine particulate comparison.
                </p>
              </div>
              <div className="text-xs text-slate-500">
                Your reading:{" "}
                <span className="font-semibold text-slate-900">
                  {M.PM25 ? `${M.PM25.toFixed(1)} µg/m³` : "—"}
                </span>
              </div>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={pm25Compare}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                  />
                  <Tooltip content={<CustomTooltip unit="µg/m³" />} />
                  <ReferenceLine
                    y={HOUSTON_REFERENCES.pm25Benchmark}
                    stroke="#22c55e"
                    strokeDasharray="4 4"
                    label={{
                      value: "SaSo Target",
                      position: "top",
                      fontSize: 10,
                      fill: "#16a34a",
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {pm25Compare.map((entry, index) => (
                      <Cell key={`c-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* PM10 */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  PM₁₀
                </div>
                <p className="text-xs text-slate-500">
                  Coarse particulate comparison.
                </p>
              </div>
              <div className="text-xs text-slate-500">
                Your reading:{" "}
                <span className="font-semibold text-slate-900">
                  {M.PM10 ? `${M.PM10.toFixed(1)} µg/m³` : "—"}
                </span>
              </div>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={pm10Compare}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                  />
                  <Tooltip content={<CustomTooltip unit="µg/m³" />} />
                  <ReferenceLine
                    y={HOUSTON_REFERENCES.pm10Benchmark}
                    stroke="#22c55e"
                    strokeDasharray="4 4"
                    label={{
                      value: "SaSo Target",
                      position: "top",
                      fontSize: 10,
                      fill: "#16a34a",
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {pm10Compare.map((entry, index) => (
                      <Cell key={`c-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* CO2 */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  CO₂
                </div>
                <p className="text-xs text-slate-500">
                  Indoor CO₂ vs. typical conditions.
                </p>
              </div>
              <div className="text-xs text-slate-500">
                Your reading:{" "}
                <span className="font-semibold text-slate-900">
                  {M.CO2 ? `${M.CO2.toFixed(0)} ppm` : "—"}
                </span>
              </div>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={co2Compare}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                  />
                  <Tooltip content={<CustomTooltip unit="ppm" />} />
                  <ReferenceLine
                    y={HOUSTON_REFERENCES.co2Benchmark}
                    stroke="#22c55e"
                    strokeDasharray="4 4"
                    label={{
                      value: "SaSo Target",
                      position: "top",
                      fontSize: 10,
                      fill: "#16a34a",
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {co2Compare.map((entry, index) => (
                      <Cell key={`c-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </Section>

      {/* ACTION SECTION */}
      <Section id="action" label="Next Steps" title="Your prioritized mitigation plan">
        <div className="grid gap-6 md:grid-cols-[minmax(0,2.5fr)_minmax(0,2fr)]">
          {/* Left: Narrative plan */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Personalized Roadmap
                </div>
                <h3 className="mt-1 text-sm font-semibold text-slate-900">
                  What we recommend for this home, in this order
                </h3>
              </div>
            </div>

            <ol className="mt-3 space-y-3 text-sm text-slate-700">
              <li>
                <div className="font-semibold text-slate-900">
                  1. Stabilize daily air quality
                </div>
                <p className="mt-1">
                  Focus first on the rooms where your household spends the most
                  time: bedrooms, living room, and home office (if applicable).
                  Based on your current readings, we recommend:
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>
                    Run a <strong>HEPA purifier</strong> in the bedroom
                    overnight and living area during use.
                  </li>
                  <li>
                    Use your kitchen exhaust fan whenever cooking, especially
                    when searing or using gas.
                  </li>
                  <li>
                    Periodically open windows or use mechanical ventilation when
                    outdoor air quality is good.
                  </li>
                </ul>
              </li>

              <li>
                <div className="font-semibold text-slate-900">
                  2. Tighten up water quality at points of use
                </div>
                <p className="mt-1">
                  Even when municipal water is &quot;in spec,&quot; many
                  households prefer to reduce TDS and chlorine for taste and
                  skin comfort. For this home, the highest-impact upgrades would
                  be:
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>
                    Install a <strong>point-of-use carbon filter</strong> on the
                    primary drinking/cooking tap.
                  </li>
                  <li>
                    Consider a <strong>shower filter</strong> for the most
                    frequently used bathroom to reduce chlorine exposure.
                  </li>
                </ul>
              </li>

              <li>
                <div className="font-semibold text-slate-900">
                  3. Optimize &quot;Ether&quot; around sleep and focus
                </div>
                <p className="mt-1">
                  We prioritize EMF/Ether improvements where your body is in one
                  place for long periods: beds and desks. For this home, we
                  recommend:
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>
                    Move routers, cordless bases, and large electronics at least{" "}
                    <strong>6–8 feet</strong> away from beds where feasible.
                  </li>
                  <li>
                    Use &quot;airplane mode&quot; or a dedicated charging spot
                    outside the bedroom overnight.
                  </li>
                  <li>
                    Route power strips and chargers away from the head of the
                    bed to reduce ELF electric and magnetic fields.
                  </li>
                </ul>
              </li>

              <li>
                <div className="font-semibold text-slate-900">
                  4. Re-test after changes
                </div>
                <p className="mt-1">
                  After implementing your top 1–3 changes, we recommend a
                  follow-up measurement session to confirm the impact—especially
                  for CO₂, PM₂.₅, and humidity. This also helps fine-tune any
                  remaining issues rather than overcorrecting.
                </p>
              </li>
            </ol>
          </Card>

          {/* Right: Quick-hit checklist */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Quick Actions
                </div>
                <h3 className="mt-1 text-sm font-semibold text-slate-900">
                  High-value moves in the next 30 days
                </h3>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex gap-2">
                <span className="mt-1 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border border-emerald-400 bg-emerald-50 text-[10px] text-emerald-700">
                  1
                </span>
                <span>
                  Add a <strong>HEPA-grade air purifier</strong> to the
                  most-used bedroom, and run it nightly on low or medium.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border border-sky-400 bg-sky-50 text-[10px] text-sky-700">
                  2
                </span>
                <span>
                  Use <strong>kitchen exhaust</strong> every time you cook,
                  especially for searing, roasting, or high heat.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border border-amber-400 bg-amber-50 text-[10px] text-amber-700">
                  3
                </span>
                <span>
                  Install a <strong>carbon block filter</strong> on the main
                  drinking tap to reduce chlorine and off-flavors.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border border-slate-400 bg-slate-50 text-[10px] text-slate-700">
                  4
                </span>
                <span>
                  Move <strong>Wi-Fi routers</strong> and always-on electronics
                  away from beds and work chairs when practical.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border border-slate-400 bg-slate-50 text-[10px] text-slate-700">
                  5
                </span>
                <span>
                  Set a simple habit:{" "}
                  <strong>10 minutes of fresh air</strong> (open windows or use
                  ventilation) after cooking or gatherings.
                </span>
              </li>
            </ul>
          </Card>
        </div>
      </Section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-slate-500">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <p>
              © {new Date().getFullYear()} Sanctuary Solutions™ · Home Health
              Engineers
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a href="#snapshot" className="hover:text-slate-700">
                Snapshot
              </a>
              <a href="#expandables" className="hover:text-slate-700">
                Metrics
              </a>
              <a href="#rooms" className="hover:text-slate-700">
                Rooms
              </a>
              <a href="#compare" className="hover:text-slate-700">
                Compare
              </a>
              <a href="#action" className="hover:text-slate-700">
                Action
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* PRINT STYLES */}
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          header, .print\\:hidden { display: none !important; }
          section { page-break-inside: avoid; }
          a::after {
            content: "";
          }
        }
      `}</style>
    </div>
  );
}
