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
// - Pulls latest property + measurements from Supabase
// - Computes Air/Water/Ether scores based on SaSo v1.1 thresholds
// - Renders the same aesthetic you liked (snapshot → metrics → compare → action)
// - Ozone chart REMOVED per request
// - Enhanced with micro-interactions & motion for a premium feel
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

// Weights for category scoring (v1.1) – still used for Ether
const WEIGHTS_AIR: Record<string, number> = {
  CO2: 0.25,
  PM25: 0.25,
  PM10: 0.1,
  VOCs: 0.2,
  Humidity: 0.1,
  Temp: 0.1,
};
const WEIGHTS_WATER: Record<string, number> = { TDS: 0.4, Cl: 0.3, pH: 0.3 };
const WEIGHTS_ETHER: Record<string, number> = { MagField: 0.3, ElectricField: 0.3, RF: 0.4 };

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
  metric: MetricKey; // <-- EXACT Supabase column name
  value: number;
  unit: string | null;
  location: string | null;
  created_at: string;
}

// Property row
interface PropertyRow {
  id: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  occupants_adults: number | null;
  occupants_children: number | null;
  pets: string | null;
  created_at: string;
}

// Utility to get category from metric key
function getCategory(metricKey: MetricKey): CategoryKey {
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

// Weighted category score using metric scores
function weightedCategoryScore(metricScores: Record<MetricKey, number>, weights: Record<string, number>): number {
  let totalWeight = 0;
  let sum = 0;
  for (const k of Object.keys(weights)) {
    const w = weights[k];
    const s = metricScores[k as MetricKey] ?? 0;
    totalWeight += w;
    sum += s * w;
  }
  return totalWeight > 0 ? Math.round(sum / totalWeight) : 0;
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
  <section id={id} className="scroll-mt-24 border-t border-slate-200 bg-white/80 py-10 backdrop-blur-sm">
    <div className="mx-auto max-w-6xl px-4">
      <div className="mb-6 flex items-baseline justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
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
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
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

// Main Report Page
export default function ReportPage() {
  const [loading, setLoading] = useState(true);
  const [property, setProperty] = useState<PropertyRow | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch property + measurements (supports magic link)
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      // 1️. Read token from URL
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      let propertyIdToLoad: string | null = null;

      if (token) {
        // 2️. Validate token
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

        // 3️. Check expiration
        if (accessRow.expires_at && new Date(accessRow.expires_at) < new Date()) {
          setError("This link has expired.");
          setLoading(false);
          return;
        }

        // 4️. Valid token → load this property
        propertyIdToLoad = accessRow.property_id;
      }

      // 5️. If no token, fallback to latest property
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

        const latestProperty = propertyRows[0];
        setProperty(latestProperty);
        propertyIdToLoad = latestProperty.id;
      } else {
        // 6️. Load property by ID (magic link path)
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

        setProperty(propertyRow);
      }

      // 7️. Load measurements for the chosen property
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

      setMeasurements(measurementRows ?? []);
      setLoading(false);
    };

    fetchData();
  }, []);

  const M = useMemo(() => {
    const base: Record<MetricKey, number> = {
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

    for (const row of measurements) {
      if (!row.metric || base[row.metric] === undefined) continue;
      // For now: assume one reading per metric per property; if multiple, we could average
      base[row.metric] = row.value;
    }

    return base;
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

  // Category scores
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
        airScore * OVERALL_WEIGHTS.air + waterScore * OVERALL_WEIGHTS.water + etherScore * OVERALL_WEIGHTS.ether
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            <p className="text-sm text-slate-500">Building your Home Health Report…</p>
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
            <h1 className="text-lg font-semibold text-slate-900">No properties found</h1>
            <p className="mt-2 text-sm text-slate-600">
              Once you complete your first on-site assessment, your full Home Health Report will appear here.
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

  const addressLine = [property.address_line1, property.address_line2].filter(Boolean).join(", ");
  const cityLine = [property.city, property.state, property.postal_code].filter(Boolean).join(", ");

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
              transition={{ type: "spring", stiffness: 120, damping: 22, delay: 0.15 }}
            />
            <div className="relative space-y-4">
              <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Home Health Report</h1>
                  <p className="mt-1 text-slate-600">
                    Most recent property · {new Date(property.created_at).toLocaleDateString()} ·{" "}
                    {property.city ?? ""}
                    {property.city ? ", " : ""}
                    {property.state ?? ""}
                  </p>
                  <p className="mt-2 text-slate-700">
                    Categories tested: <strong>Air</strong> · <strong>Water</strong> · <strong>Ether</strong>
                  </p>
                </div>
                <Card className="md:min-w-[340px]">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Overall Home Health</div>
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
                      transition={{ type: "spring", stiffness: 160, damping: 20, delay: 0.1 }}
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
                      <span className="text-[10px] uppercase tracking-wide text-slate-500">Air</span>
                      <span className="mt-1 text-sm font-semibold text-slate-900">{airScore}</span>
                      <span className="text-[10px] text-slate-500">{airLabel}</span>
                    </div>
                    <div className="flex flex-col rounded-lg bg-slate-50 px-2.5 py-1.5">
                      <span className="text-[10px] uppercase tracking-wide text-slate-500">Water</span>
                      <span className="mt-1 text-sm font-semibold text-slate-900">{waterScore}</span>
                      <span className="text-[10px] text-slate-500">{waterLabel}</span>
                    </div>
                    <div className="flex flex-col rounded-lg bg-slate-50 px-2.5 py-1.5">
                      <span className="text-[10px] uppercase tracking-wide text-slate-500">Ether</span>
                      <span className="mt-1 text-sm font-semibold text-slate-900">{etherScore}</span>
                      <span className="text-[10px] text-slate-500">{etherLabel(etherScore)}</span>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="space-y-1 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Property</div>
                  <div className="text-[13px] font-medium text-slate-900">{addressLine || "Address on file"}</div>
                  <div className="text-[12px] text-slate-500">{cityLine || "City, State"}</div>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Household</div>
                  <div className="flex flex-wrap gap-1.5 text-[12px] text-slate-600">
                    {property.occupants_adults !== null && (
                      <Chip>{property.occupants_adults} adult{property.occupants_adults === 1 ? "" : "s"}</Chip>
                    )}
                    {property.occupants_children !== null && (
                      <Chip>
                        {property.occupants_children} child{property.occupants_children === 1 ? "" : "ren"}
                      </Chip>
                    )}
                    {property.pets && <Chip>{property.pets}</Chip>}
                    {!property.occupants_adults &&
                      !property.occupants_children &&
                      !property.pets && <span className="text-slate-400">Household details not provided.</span>}
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Flags</div>
                  <div className="flex flex-wrap gap-1.5 text-[12px]">
                    {humidityFlag && (
                      <Chip>
                        Humidity outside 40–60%{" "}
                        <span className="ml-1 text-[10px] text-slate-400">(comfort + mold risk)</span>
                      </Chip>
                    )}
                    {M.CO2 > 1200 && (
                      <Chip>
                        Elevated CO₂ during measurement
                        <span className="ml-1 text-[10px] text-slate-400">(ventilation recommended)</span>
                      </Chip>
                    )}
                    {M.PM25 > 20 && (
                      <Chip>
                        Elevated fine particles
                        <span className="ml-1 text-[10px] text-slate-400">(filtration recommended)</span>
                      </Chip>
                    )}
                    {!humidityFlag && M.CO2 <= 1200 && M.PM25 <= 20 && (
                      <span className="text-[12px] text-slate-400">No significant flags at time of testing.</span>
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
                  Higher scores indicate better conditions for long-term health and comfort.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col items-center justify-center gap-2">
                <MetricRing percent={airScore} color={scoreToColor(airScore)} />
                <span className="text-[11px] text-slate-500">{airLabel}</span>
		<span className="text-[11px] text-slate-400 italic">{airSummary}</span>
              </div>
              <div className="flex flex-col items-center justify-center gap-2">
                <MetricRing percent={waterScore} color={scoreToColor(waterScore)} />
                <span className="text-[11px] text-slate-500">{waterLabel}</span>
		<span className="text-[11px] text-slate-400 italic">{waterSummary}</span>
              </div>
              <div className="flex flex-col items-center justify-center gap-2">
                <MetricRing percent={etherScore} color={scoreToColor(etherScore)} />
                <span className="text-[11px] text-slate-500">{etherLabel(etherScore)}</span>
		<span className="text-[11px] text-slate-400 italic">{etherSummary}</span>
              </div>
            </div>
          </Card>
        </div>
      </Section>

      {/* DETAILED METRICS SECTION */}
      <Section id="expandables" label="Detailed View" title="How your home performed by metric">
        <div className="grid gap-4 md:grid-cols-3">
          {/* AIR */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Air</div>

            <ExpandableCard
              title="CO₂ (Carbon Dioxide)"
              subtitle="Impacts alertness, decision-making, and sleep quality."
              score={metricScores.CO2}
              statusLabel={co2Status}
              defaultOpen
            >
              <p>
                Your snapshot reading was{" "}
                <span className="font-semibold text-slate-900">{M.CO2?.toFixed(0) ?? "—"} ppm</span>.{" "}
                <span className="font-medium text-slate-800">{co2Status}.</span>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                <li>
                  <strong>{"≤ 700 ppm"}</strong> is considered fresh, outdoor-like air where most people feel sharp and
                  clear.
                </li>
                <li>
                  <strong>700–1000 ppm</strong> is typical of occupied indoor spaces with decent ventilation.
                </li>
                <li>
                  <strong>Above ~1200 ppm</strong>, people often report stuffiness, fatigue, and reduced focus.
                </li>
              </ul>
              <p className="mt-2 text-sm text-slate-700">
                Sustained CO₂ above 1500–2000 ppm can impair complex thinking and make spaces feel oppressive. The goal
                is to keep your daily peaks closer to{" "}
                <span className="font-medium text-slate-900">{HOUSTON_REFERENCES.co2Benchmark} ppm</span> or below
                during active use.
              </p>
            </ExpandableCard>

            <ExpandableCard
              title="PM₂.₅ (Fine Particles)"
              subtitle="Tiny particles that can reach deep into the lungs."
              score={metricScores.PM25}
              statusLabel={pm25Status}
            >
              <p>
                Your PM₂.₅ reading was{" "}
                <span className="font-semibold text-slate-900">
                  {M.PM25 ? `${M.PM25.toFixed(1)} µg/m³` : "—"}
                </span>
                . <span className="font-medium text-slate-800">{pm25Status} overall.</span>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                <li>
                  <strong>0–9 µg/m³</strong>: excellent, aligned with the latest WHO annual guideline.
                </li>
                <li>
                  <strong>9–20 µg/m³</strong>: moderate; common in traffic-exposed or cooking-heavy spaces.
                </li>
                <li>
                  <strong>{" > 20 µg/m³"}</strong>: elevated; long-term exposure is associated with respiratory and
                  cardiovascular risk.
                </li>
              </ul>
              <p className="mt-2 text-sm text-slate-700">
                Sources include cooking, candles, outdoor pollution, and poorly filtered HVAC. We generally recommend
                kitchen exhaust use and a HEPA-grade purifier if levels are regularly above{" "}
                <span className="font-medium text-slate-900">10–15 µg/m³</span>.
              </p>
            </ExpandableCard>

            <ExpandableCard
              title="PM₁₀ (Coarse Particles)"
              subtitle="Larger particles linked to irritation and dust load."
              score={metricScores.PM10}
              statusLabel={pm10Status}
            >
              <p>
                Your PM₁₀ reading was{" "}
                <span className="font-semibold text-slate-900">
                  {M.PM10 ? `${M.PM10.toFixed(1)} µg/m³` : "—"}
                </span>
                . <span className="font-medium text-slate-800">{pm10Status} overall.</span>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                <li>
                  <strong>≤ 30 µg/m³</strong>: excellent for an indoor setting.
                </li>
                <li>
                  <strong>30–50 µg/m³</strong>: moderate; expect more visible dust and potential irritation for
                  sensitive individuals.
                </li>
                <li>
                  <strong>{"> 50 µg/m³"}</strong>: high; often seen in dusty, high-traffic, or renovation-adjacent
                  areas.
                </li>
              </ul>
              <p className="mt-2 text-sm text-slate-700">
                Elevated PM₁₀ can be a sign of resuspended dust, open windows near busy roads, or inadequate filtration
                on your HVAC system.
              </p>
            </ExpandableCard>

            <ExpandableCard
              title="Temp & Humidity"
              subtitle="Comfort envelope and mold risk factors."
              score={metricScores.Humidity}
              statusLabel={
                humidityFlag ? "Outside optimal range" : metricScores.Humidity >= 80 ? "Comfortable" : "Monitor"
              }
            >
              <p>
                At the time of testing, indoor temperature was{" "}
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
                  <strong>40–60% humidity</strong> is typically best for comfort, respiratory health, and mold
                  prevention.
                </li>
                <li>
                  Below <strong>40%</strong>, air can feel dry and irritating to the eyes and airways.
                </li>
                <li>
                  Above <strong>60%</strong>, the risk of dust mites and mold growth increases over time.
                </li>
              </ul>
              <p className="mt-2 text-sm text-slate-700">
                We look at humidity in context with your building envelope, HVAC settings, and local climate to balance
                comfort with long-term durability.
              </p>
            </ExpandableCard>
          </div>

          {/* WATER */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Water</div>

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
                Your TDS reading was{" "}
                <span className="font-semibold text-slate-900">{M.TDS ? `${M.TDS.toFixed(0)} ppm` : "—"}</span>.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                <li>
                  <strong>{"< 150 ppm"}</strong>: very low mineral content, similar to many filtration systems.
                </li>
                <li>
                  <strong>150–300 ppm</strong>: typical for municipal tap water.
                </li>
                <li>
                  <strong>{"> 300 ppm"}</strong>: higher mineral load; may impact taste, scaling, and appliance life.
                </li>
              </ul>
              <p className="mt-2 text-sm text-slate-700">
                TDS doesn&apos;t specify exactly what&apos;s present, but it&apos;s a valuable screening metric. For
                elevated readings, we often recommend point-of-use filtration with carbon + sediment stages, and in some
                cases reverse osmosis.
              </p>
            </ExpandableCard>

            <ExpandableCard
              title="Chlorine"
              subtitle="Disinfection byproduct with taste and respiratory impact."
              score={metricScores.Cl}
              statusLabel={M.Cl <= 0.5 ? "Low" : M.Cl <= 1.5 ? "Typical municipal" : M.Cl <= 3 ? "High" : "Very high"}
            >
              <p>
                Your chlorine level was{" "}
                <span className="font-semibold text-slate-900">{M.Cl ? `${M.Cl.toFixed(2)} ppm` : "—"}</span>.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                <li>
                  <strong>0.2–1.0 ppm</strong> is common for municipal systems.
                </li>
                <li>
                  Elevated chlorine can dry skin and hair and aggravate sensitive airways, especially during showering.
                </li>
              </ul>
              <p className="mt-2 text-sm text-slate-700">
                Carbon filtration is highly effective at reducing chlorine, improving both taste and shower experience.
              </p>
            </ExpandableCard>

            <ExpandableCard
              title="pH"
              subtitle="Acid/alkaline balance of your tap water."
              score={metricScores.pH}
              statusLabel={
                M.pH >= 6.5 && M.pH <= 8.5 ? "Ideal range" : M.pH ? "Outside recommended range" : "Not measured"
              }
            >
              <p>
                Your measured pH was{" "}
                <span className="font-semibold text-slate-900">{M.pH ? M.pH.toFixed(2) : "—"}</span>.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                <li>
                  <strong>6.5–8.5</strong> is generally considered acceptable for drinking water from a corrosivity and
                  taste perspective.
                </li>
                <li>
                  Significantly low pH can contribute to pipe corrosion; very high pH can cause scaling and off taste.
                </li>
              </ul>
              <p className="mt-2 text-sm text-slate-700">
                pH is interpreted alongside TDS, hardness, and plumbing materials to decide whether treatment or
                corrosion control is appropriate.
              </p>
            </ExpandableCard>
          </div>

          {/* ETHER */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Ether</div>

            <ExpandableCard
              title="Magnetic Fields (ELF)"
              subtitle="Extremely low frequency fields from wiring and large appliances."
              score={metricScores.MagField}
              statusLabel={
                M.MagField <= 1 ? "Very low" : M.MagField <= 2 ? "Low" : M.MagField <= 4 ? "Moderate" : "Elevated"
              }
              defaultOpen
            >
              <p>
                Snapshot magnetic field was{" "}
                <span className="font-semibold text-slate-900">
                  {M.MagField ? `${M.MagField.toFixed(2)} mG` : "—"}
                </span>
                .
              </p>
              <p className="mt-2 text-sm text-slate-700">
                While there are no universally accepted residential limits, many precautionary guidelines aim to keep
                long-term sleeping areas below about <strong>1–2 mG</strong> when feasible.
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
                Electric field at the time of testing was{" "}
                <span className="font-semibold text-slate-900">
                  {M.ElectricField ? `${M.ElectricField.toFixed(2)} V/m` : "—"}
                </span>
                .
              </p>
              <p className="mt-2 text-sm text-slate-700">
                We focus most remediation on sleeping areas and high-use workspaces, using distance, wiring
                optimization, and device placement adjustments.
              </p>
            </ExpandableCard>

            <ExpandableCard
              title="Radiofrequency (RF)"
              subtitle="Wireless signals from Wi-Fi, phones, and nearby infrastructure."
              score={metricScores.RF}
              statusLabel={M.RF <= 0.05 ? "Very low" : M.RF <= 0.1 ? "Low" : M.RF <= 1 ? "Moderate" : "Elevated"}
            >
              <p>
                RF power density snapshot was{" "}
                <span className="font-semibold text-slate-900">
                  {M.RF ? `${M.RF.toFixed(3)} mW/m²` : "—"}
                </span>
                .
              </p>
              <p className="mt-2 text-sm text-slate-700">
                we interpret RF in context: proximity to routers and devices, sleep locations, and your sensitivity
                profile. When requested, we prioritize reducing nighttime and long-duration exposures.
              </p>
            </ExpandableCard>
          </div>
        </div>
      </Section>

      {/* COMPARISON SECTION */}
      <Section id="compare" label="Context" title="How your air compares">
        <div className="grid gap-6 md:grid-cols-3">
          {/* PM2.5 */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">PM₂.₅</div>
                <p className="text-xs text-slate-500">Fine particulate comparison.</p>
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
                <BarChart data={pm25Compare} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
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
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">PM₁₀</div>
                <p className="text-xs text-slate-500">Coarse particulate comparison.</p>
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
                <BarChart data={pm10Compare} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
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
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">CO₂</div>
                <p className="text-xs text-slate-500">Indoor CO₂ vs. typical conditions.</p>
              </div>
              <div className="text-xs text-slate-500">
                Your reading:{" "}
                <span className="font-semibold text-slate-900">{M.CO2 ? `${M.CO2.toFixed(0)} ppm` : "—"}</span>
              </div>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={co2Compare} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
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
                <div className="font-semibold text-slate-900">1. Stabilize daily air quality</div>
                <p className="mt-1">
                  Focus first on the rooms where your household spends the most time: bedrooms, living room, and home
                  office (if applicable). Based on your current readings, we recommend:
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>
                    Run a <strong>HEPA purifier</strong> in the bedroom overnight and living area during use.
                  </li>
                  <li>
                    Use your kitchen exhaust fan whenever cooking, especially when searing or using gas.
                  </li>
                  <li>
                    Periodically open windows or use mechanical ventilation when outdoor air quality is good.
                  </li>
                </ul>
              </li>

              <li>
                <div className="font-semibold text-slate-900">2. Tighten up water quality at points of use</div>
                <p className="mt-1">
                  Even when municipal water is &quot;in spec,&quot; many households prefer to reduce TDS and chlorine
                  for taste and skin comfort. For this home, the highest-impact upgrades would be:
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>
                    Install a <strong>point-of-use carbon filter</strong> on the primary drinking/cooking tap.
                  </li>
                  <li>
                    Consider a <strong>shower filter</strong> for the most frequently used bathroom to reduce chlorine
                    exposure.
                  </li>
                </ul>
              </li>

              <li>
                <div className="font-semibold text-slate-900">3. Optimize &quot;Ether&quot; around sleep and focus</div>
                <p className="mt-1">
                  We prioritize EMF/Ether improvements where your body is in one place for long periods: beds and
                  desks. For this home, we recommend:
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>
                    Move routers, cordless bases, and large electronics at least <strong>6–8 feet</strong> away from
                    beds where feasible.
                  </li>
                  <li>
                    Use &quot;airplane mode&quot; or a dedicated charging spot outside the bedroom overnight.
                  </li>
                  <li>
                    Route power strips and chargers away from the head of the bed to reduce ELF electric and magnetic
                    fields.
                  </li>
                </ul>
              </li>

              <li>
                <div className="font-semibold text-slate-900">4. Re-test after changes</div>
                <p className="mt-1">
                  After implementing your top 1–3 changes, we recommend a follow-up measurement session to confirm the
                  impact—especially for CO₂, PM₂.₅, and humidity. This also helps fine-tune any remaining issues rather
                  than overcorrecting.
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
                <h3 className="mt-1 text-sm font-semibold text-slate-900">High-value moves in the next 30 days</h3>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex gap-2">
                <span className="mt-1 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border border-emerald-400 bg-emerald-50 text-[10px] text-emerald-700">
                  1
                </span>
                <span>
                  Add a <strong>HEPA-grade air purifier</strong> to the most-used bedroom, and run it nightly on low or
                  medium.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border border-sky-400 bg-sky-50 text-[10px] text-sky-700">
                  2
                </span>
                <span>
                  Use <strong>kitchen exhaust</strong> every time you cook, especially for searing, roasting, or high
                  heat.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border border-amber-400 bg-amber-50 text-[10px] text-amber-700">
                  3
                </span>
                <span>
                  Install a <strong>carbon block filter</strong> on the main drinking tap to reduce chlorine and
                  off-flavors.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border border-slate-400 bg-slate-50 text-[10px] text-slate-700">
                  4
                </span>
                <span>
                  Move <strong>Wi-Fi routers</strong> and always-on electronics away from beds and work chairs when
                  practical.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border border-slate-400 bg-slate-50 text-[10px] text-slate-700">
                  5
                </span>
                <span>
                  Set a simple habit: <strong>10 minutes of fresh air</strong> (open windows or use ventilation) after
                  cooking or gatherings.
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
            <p>© {new Date().getFullYear()} Sanctuary Solutions™ · Home Health Engineers</p>
            <div className="flex flex-wrap items-center gap-3">
              <a href="#snapshot" className="hover:text-slate-700">
                Snapshot
              </a>
              <a href="#expandables" className="hover:text-slate-700">
                Metrics
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
