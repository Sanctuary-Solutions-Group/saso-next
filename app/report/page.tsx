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
import { MetricRing } from "@/components/MetricRing";

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

// Weights for category scoring (v1.1)
const WEIGHTS_AIR: Record<string, number> = { CO2: 0.25, PM25: 0.25, PM10: 0.1, VOCs: 0.2, Humidity: 0.1, Temp: 0.1 };
const WEIGHTS_WATER: Record<string, number> = { TDS: 0.4, Cl: 0.3, pH: 0.3 };
const WEIGHTS_ETHER: Record<string, number> = { MagField: 0.3, ElectricField: 0.3, RF: 0.4 };

// Overall category weights
const OVERALL_WEIGHTS = { air: 0.5, water: 0.3, ether: 0.2 } as const;

// ====== TYPES ======
interface PropertyRow {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sqft: number | null;
  year_built: number | null;
  primary_contact_email: string | null;
  created_at: string;
}

interface MeasurementRow {
  id: string;
  property_id: string;
  report_id: string | null;
  category: "air" | "water" | "ether";
  metric: string; // e.g., 'PM25'
  value: number;
  unit: string | null;
  taken_at: string;
  created_at: string;
}

// ====== SCORING HELPERS ======
function bandLabel(value: number, goodMax: number, fairMax: number) {
  if (value <= goodMax) return "good";
  if (value <= fairMax) return "fair";
  return "poor";
}

function bandColor(tone: "good" | "fair" | "poor") {
  return tone === "good" ? brand.good : tone === "fair" ? brand.warn : brand.bad;
}

// Map raw value to a 0–100 metric score (higher is better)
function metricScore(value: number, goodMax: number, fairMax: number) {
  if (value <= goodMax) return 100;
  if (value <= fairMax) {
    // Linearly drop from 100 → 70 across fair band
    const t = (value - goodMax) / Math.max(1e-6, fairMax - goodMax);
    return Math.round(100 - 30 * t);
  }
  // Beyond fair: drop from 70 → 40 as it doubles fairMax (soft landing)
  const t = Math.min(1, (value - fairMax) / Math.max(1e-6, fairMax));
  return Math.round(70 - 30 * t);
}

function weightedCategoryScore(values: Record<string, number>, weights: Record<string, number>) {
  let sum = 0;
  let wsum = 0;
  for (const k of Object.keys(weights)) {
    if (values[k] == null) continue;
    sum += values[k] * weights[k];
    wsum += weights[k];
  }
  return wsum > 0 ? Math.round(sum / wsum) : 0;
}

// ====== UI SUB-COMPONENTS ======
function Progress({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const tone = clamped >= 85 ? "good" : clamped >= 70 ? "fair" : clamped >= 50 ? "fair" : "poor";
  return (
    <div className="h-3 w-full rounded-full bg-slate-200">
      <div className="h-3 rounded-full" style={{ width: `${clamped}%`, background: bandColor(tone as any) }} />
    </div>
  );
}

type TagProps = {
  children: React.ReactNode;
  tone?: "default" | "good" | "fair" | "poor";
};

function Tag({ children, tone = "default" }: TagProps) {
  const classes: Record<string, string> = {
    default: "bg-slate-100 text-slate-700",
    good: "bg-emerald-100 text-emerald-700",
    fair: "bg-amber-100 text-amber-700",
    poor: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${classes[tone]}`}>
      {children}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: "0px 8px 24px rgba(15,23,42,0.16)" }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 ${className}`}
    >
      {children}
    </motion.div>
  );
}

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 py-12">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  unit,
  metricKey,
  tips,
  note,
}: {
  label: string;
  value: number | null;
  unit?: string;
  metricKey: string;
  tips: string[];
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const t = THRESHOLDS[metricKey];
  const band = value == null ? "fair" : bandLabel(value, t.goodMax, t.fairMax);
  const color = bandColor(band as any);
  const percent = value == null ? 0 : Math.min(100, (value / t.fairMax) * 100); // simple fill ratio for ring

  return (
    <motion.div
      className="rounded-2xl ring-1 ring-slate-200 bg-white"
      whileHover={{ y: -1, boxShadow: "0px 6px 18px rgba(15,23,42,0.12)" }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ rotate: 3, scale: 1.05 }}
            whileTap={{ rotate: -3, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
          >
            <MetricRing percent={percent} color={color} />
          </motion.div>
          <div className="text-left">
            <div className="text-sm font-semibold text-slate-800">{label}</div>
            <div className="text-xs text-slate-500">
              {value != null ? (
                <>
                  Your reading:{" "}
                  <strong className="text-slate-700">
                    {value} {unit}
                  </strong>
                </>
              ) : (
                <em className="text-slate-400">No reading</em>
              )}
            </div>
          </div>
        </div>
        <Tag tone={band as any}>
          {band === "good" ? "Within Range" : band === "fair" ? "Needs Attention" : "High Risk"}
        </Tag>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="metric-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="border-t border-slate-200 px-4 py-4 text-sm overflow-hidden"
          >
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Safe Range</div>
                <div className="mt-1 text-slate-800">
                  Good ≤ {t.goodMax}
                  {t.unit ? ` ${t.unit}` : ""}; Fair ≤ {t.fairMax}
                  {t.unit ? ` ${t.unit}` : ""}
                </div>
                {note && <div className="mt-2 text-xs text-slate-500">{note}</div>}
              </div>
              <div className="md:col-span-2">
                <div className="text-xs uppercase tracking-wide text-slate-500">Top Mitigation Tips</div>
                <ul className="mt-1 list-disc pl-5 text-slate-700 space-y-1">
                  {tips.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ====== PAGE COMPONENT ======
export default function ReportPage() {
  const [loading, setLoading] = useState(true);
  const [property, setProperty] = useState<PropertyRow | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);

  // Fetch latest property and its measurements
  useEffect(() => {
    const fetchData = async () => {
      // Get most recent property (or change to a specific id)
      const { data: prop, error: perr } = await supabase
        .from("property")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (perr || !prop) {
        setLoading(false);
        return;
      }
      setProperty(prop);

      const { data: ms, error: merr } = await supabase.from("measurement").select("*").eq("property_id", prop.id);

      if (!merr && ms) setMeasurements(ms);
      setLoading(false);
    };
    fetchData();
  }, []);

  // Build a metric map for easy lookup
  const M = useMemo(() => {
    const m: Record<string, number | null> = {
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
      if (row.metric in m) m[row.metric] = Number(row.value);
    }
    return m;
  }, [measurements]);

  // Compute per-metric scores
  const metricScores = useMemo(() => {
    const s: Record<string, number> = {};
    for (const k of Object.keys(THRESHOLDS)) {
      const val = (M as any)[k];
      if (val == null) continue;
      const { goodMax, fairMax } = THRESHOLDS[k];
      s[k] = metricScore(val, goodMax, fairMax);
    }
    return s;
  }, [M]);

  // Category scores
  const airScore = useMemo(() => weightedCategoryScore(metricScores, WEIGHTS_AIR), [metricScores]);
  const waterScore = useMemo(() => weightedCategoryScore(metricScores, WEIGHTS_WATER), [metricScores]);
  const etherScore = useMemo(() => weightedCategoryScore(metricScores, WEIGHTS_ETHER), [metricScores]);
  const overallScore = useMemo(
    () =>
      Math.round(
        airScore * OVERALL_WEIGHTS.air + waterScore * OVERALL_WEIGHTS.water + etherScore * OVERALL_WEIGHTS.ether,
      ),
    [airScore, waterScore, etherScore],
  );

  // Comparison chart data (remove ozone; keep PM + CO2 only)
  const pm25Compare = useMemo(
    () => [
      { label: "Your Home", value: M.PM25 ?? 0, color: brand.bad },
      { label: "Houston Avg", value: HOUSTON_REFERENCES.pm25Avg, color: brand.warn },
      { label: "EPA 2024 Std", value: HOUSTON_REFERENCES.pm25Benchmark, color: brand.accent },
    ],
    [M.PM25],
  );

  const pm10Compare = useMemo(
    () => [
      { label: "Your Home", value: M.PM10 ?? 0, color: brand.bad },
      { label: "Houston Avg", value: HOUSTON_REFERENCES.pm10Avg, color: brand.warn },
      { label: "SaSo Benchmark", value: HOUSTON_REFERENCES.pm10Benchmark, color: brand.accent },
    ],
    [M.PM10],
  );

  const co2Compare = useMemo(
    () => [
      { label: "Your Home", value: M.CO2 ?? 0, color: brand.bad },
      { label: "Houston Typical", value: HOUSTON_REFERENCES.co2IndoorTypical, color: brand.warn },
      { label: "SaSo Good", value: HOUSTON_REFERENCES.co2Benchmark, color: brand.accent },
    ],
    [M.CO2],
  );

  if (loading) return <div className="p-8 text-slate-600">Loading report…</div>;
  if (!property) return <div className="p-8 text-red-600">No property found. Add a property in Supabase first.</div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      {/* Sticky Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <motion.div
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-bold"
              whileHover={{ rotate: -4, scale: 1.03 }}
              transition={{ type: "spring", stiffness: 280, damping: 18 }}
            >
              Sa
            </motion.div>
            <div>
              <div className="text-sm font-semibold tracking-wide text-slate-700">Sanctuary Solutions™</div>
              <div className="text-xs text-slate-500">Residential Home Health Report</div>
            </div>
          </div>
          <nav className="hidden gap-6 md:flex">
            <a href="#snapshot" className="text-sm text-slate-600 hover:text-slate-900">
              Snapshot
            </a>
            <a href="#expandables" className="text-sm text-slate-600 hover:text-slate-900">
              Metrics
            </a>
            <a href="#compare" className="text-sm text-slate-600 hover:text-slate-900">
              Compare
            </a>
            <a href="#action" className="text-sm text-slate-600 hover:text-slate-900">
              Action
            </a>
          </nav>
          <motion.button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-white shadow hover:bg-slate-800"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.18 }}
          >
            Download / Print PDF
          </motion.button>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
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
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                  >
                    <motion.span
                      initial={{ textShadow: "0 0 0 rgba(15,23,42,0)" }}
                      animate={{ textShadow: "0 8px 18px rgba(15,23,42,0.25)" }}
                      transition={{ duration: 0.8 }}
                    >
                      {overallScore}
                    </motion.span>
                  </motion.div>
                  <Tag
                    tone={
                      overallScore >= 85
                        ? "good"
                        : overallScore >= 70
                        ? "fair"
                        : overallScore >= 50
                        ? "fair"
                        : "poor"
                    }
                  >
                    {overallScore >= 85
                      ? "Excellent"
                      : overallScore >= 70
                      ? "Good"
                      : overallScore >= 50
                      ? "Moderate"
                      : "Poor"}
                  </Tag>
                </div>
                <div className="mt-3">
                  <Progress value={overallScore} />
                </div>
              </Card>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <Card>
                <div className="text-xs uppercase tracking-wide text-slate-500">Address</div>
                <div className="mt-1 text-sm font-medium">
                  {property.address}
                  {property.city ? ", " + property.city : ""}
                  {property.state ? ", " + property.state : ""} {property.zip ?? ""}
                </div>
              </Card>
              <Card>
                <div className="text-xs uppercase tracking-wide text-slate-500">Home Details</div>
                <div className="mt-1 text-sm font-medium">
                  {property.sqft ? `${property.sqft.toLocaleString()} sq ft` : "—"} · Built{" "}
                  {property.year_built ?? "—"}
                </div>
              </Card>
              <Card>
                <div className="text-xs uppercase tracking-wide text-slate-500">Contact</div>
                <div className="mt-1 text-sm font-medium">{property.primary_contact_email ?? "—"}</div>
              </Card>
              <Card>
                <div className="text-xs uppercase tracking-wide text-slate-500">Download</div>
                <div className="mt-1 text-sm">
                  Use the <em>Download / Print PDF</em> button above to save this report.
                </div>
              </Card>
            </div>
          </motion.div>
        </div>
      </section>

      {/* PAGE 1 – SNAPSHOT */}
      <Section
        id="snapshot"
        title="Your Home Health Snapshot"
        subtitle="A concise view of what we measured and what it means."
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <div className="mb-2 text-sm font-semibold">Air Quality</div>
                <Progress value={airScore} />
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  <li>
                    PM₂.₅: <strong>{M.PM25 ?? "—"} µg/m³</strong>
                  </li>
                  <li>
                    CO₂ peak: <strong>{M.CO2 ?? "—"} ppm</strong>
                  </li>
                  <li>
                    Status:{" "}
                    <Tag
                      tone={
                        (M.PM25 != null
                          ? M.PM25 <= THRESHOLDS.PM25.goodMax
                            ? "good"
                            : M.PM25 <= THRESHOLDS.PM25.fairMax
                            ? "fair"
                            : "poor"
                          : "fair") as any
                      }
                    >
                      Auto-scored
                    </Tag>
                  </li>
                </ul>
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold">Water Quality</div>
                <Progress value={waterScore} />
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  <li>
                    TDS: <strong>{M.TDS ?? "—"} ppm</strong>
                  </li>
                  <li>
                    Free Chlorine: <strong>{M.Cl ?? "—"} ppm</strong>
                  </li>
                  <li>
                    Status:{" "}
                    <Tag
                      tone={
                        (M.TDS != null
                          ? M.TDS <= THRESHOLDS.TDS.goodMax
                            ? "good"
                            : M.TDS <= THRESHOLDS.TDS.fairMax
                            ? "fair"
                            : "poor"
                          : "fair") as any
                      }
                    >
                      Auto-scored
                    </Tag>
                  </li>
                </ul>
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold">Ether (EMF)</div>
                <Progress value={etherScore} />
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  <li>
                    Mag Field (bedroom): <strong>{M.MagField ?? "—"} mG</strong>
                  </li>
                  <li>
                    Status:{" "}
                    <Tag
                      tone={
                        (M.MagField != null
                          ? M.MagField <= THRESHOLDS.MagField.goodMax
                            ? "good"
                            : M.MagField <= THRESHOLDS.MagField.fairMax
                            ? "fair"
                            : "poor"
                          : "fair") as any
                      }
                    >
                      Auto-scored
                    </Tag>
                  </li>
                </ul>
              </div>
            </div>

            <div className="my-4 h-px w-full bg-slate-200" />

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Notable Risks</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  <li>
                    PM₂.₅ target is ≤ {THRESHOLDS.PM25.goodMax} µg/m³ (EPA 2024). Your reading: {M.PM25 ?? "—"}.
                  </li>
                  <li>CO₂ above {THRESHOLDS.CO2.goodMax} ppm signals insufficient fresh air during occupancy.</li>
                  <li>
                    Water TDS {M.TDS ?? "—"} ppm may affect taste and scaling &gt; {THRESHOLDS.TDS.goodMax} ppm.
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Sanctuary Impact</div>
                <p className="mt-2 text-sm text-slate-700">
                  With targeted mitigation, we estimate <strong>≈65% reduction</strong> in fine-particle exposure and{" "}
                  <strong>≈40% lower</strong> daytime CO₂ peaks.
                </p>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Top 3 Next Steps</div>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                  <li>Deploy HEPA H13 purifier (living room).</li>
                  <li>Install under-sink carbon + RO filter.</li>
                  <li>Refresh airflow 10 min/hr while occupied.</li>
                </ol>
              </div>
            </div>
          </Card>

          <Card>
            <div className="text-sm font-semibold">Why it matters</div>
            <p className="mt-2 text-sm text-slate-700">
              Fine particles (PM₂.₅) penetrate deep into the lungs and bloodstream. Reducing everyday exposure improves
              sleep, energy, and long-term cardiovascular health. Lowering indoor CO₂ improves alertness and focus while
              working from home.
            </p>
            <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
              <strong>Tip:</strong> Run the range hood while cooking; it’s the #1 daily PM source in many homes.
            </div>
          </Card>
        </div>
      </Section>

      {/* PAGE 2 – METRICS (expandables) */}
      <Section
        id="expandables"
        title="Detailed Metrics"
        subtitle="Tap any metric to see safe ranges and mitigation steps."
      >
        {/* AIR */}
        <motion.div
          className="mb-4 text-xs uppercase tracking-wide text-slate-500"
          whileHover={{ x: 4 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <motion.span className="inline-block relative" whileHover={{ color: brand.primary }}>
            Air
            <motion.span
              layoutId="section-underline"
              className="absolute left-0 -bottom-1 h-[2px] w-full bg-blue-500"
            />
          </motion.span>
        </motion.div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="CO₂"
            value={M.CO2}
            unit="ppm"
            metricKey="CO2"
            tips={[
              "Introduce 10-minute fresh-air cycles per hour while occupied.",
              "Use ERV/HRV or timed HVAC fan for consistent air changes.",
              "Add occupancy-based ventilation in office/bedrooms.",
            ]}
          />
          <MetricCard
            label="PM₂.₅"
            value={M.PM25}
            unit="µg/m³"
            metricKey="PM25"
            tips={[
              "Upgrade HVAC filter to MERV-13+ and seal bypass gaps.",
              "Run a HEPA purifier in main living and bedrooms (ACH ≥ 4/hr).",
              "Use vent hood while cooking; lids on pans.",
            ]}
          />
          <MetricCard
            label="PM₁₀"
            value={M.PM10}
            unit="µg/m³"
            metricKey="PM10"
            tips={[
              "Vacuum with sealed HEPA; damp dust weekly.",
              "Check door/window weather-seals; manage pet dander.",
              "Isolate renovations; limit sanding indoors.",
            ]}
          />
          <MetricCard
            label="VOCs"
            value={M.VOCs}
            unit="ppb"
            metricKey="VOCs"
            tips={[
              "Switch to low/zero-VOC products and fragrance-free cleaners.",
              "Use carbon media purifiers; boost ventilation after cleaning.",
              "Bake-out new furniture with windows open for several hours.",
            ]}
          />
          <MetricCard
            label="Humidity"
            value={M.Humidity}
            unit="%"
            metricKey="Humidity"
            tips={[
              "Dehumidify in summer; run bath fans 20 min after showers.",
              "Fix leaks quickly; insulate cold surfaces to prevent condensation.",
            ]}
            note="Comfort zone 35–55%."
          />
          <MetricCard
            label="Temperature"
            value={M.Temp}
            unit="°F"
            metricKey="Temp"
            tips={["Tune supply/return balance; use ceiling fans to feel cooler at higher setpoints."]}
          />
        </div>

        {/* WATER */}
        <motion.div
          className="mt-10 mb-4 text-xs uppercase tracking-wide text-slate-500"
          whileHover={{ x: 4 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <motion.span className="inline-block relative" whileHover={{ color: brand.primary }}>
            Water
            <motion.span
              layoutId="section-underline"
              className="absolute left-0 -bottom-1 h-[2px] w-full bg-blue-500"
            />
          </motion.span>
        </motion.div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="TDS"
            value={M.TDS}
            unit="ppm"
            metricKey="TDS"
            tips={["Reverse-osmosis for drinking water.", "Consider softening if scaling is severe."]}
          />
          <MetricCard
            label="Free Chlorine"
            value={M.Cl}
            unit="ppm"
            metricKey="Cl"
            tips={["Point-of-use carbon block.", "Replace cartridges on schedule."]}
          />
          <MetricCard
            label="pH"
            value={M.pH}
            unit=""
            metricKey="pH"
            tips={["Adjust via filtration or neutralizer.", "Check hot water heater anode if corrosion noted."]}
          />
        </div>

        {/* ETHER */}
        <motion.div
          className="mt-10 mb-4 text-xs uppercase tracking-wide text-slate-500"
          whileHover={{ x: 4 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <motion.span className="inline-block relative" whileHover={{ color: brand.primary }}>
            Ether
            <motion.span
              layoutId="section-underline"
              className="absolute left-0 -bottom-1 h-[2px] w-full bg-blue-500"
            />
          </motion.span>
        </motion.div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="Magnetic Field"
            value={M.MagField}
            unit="mG"
            metricKey="MagField"
            tips={["Increase distance from transformers.", "Avoid placing power bricks near beds."]}
          />
          <MetricCard
            label="Electric Field"
            value={M.ElectricField}
            unit="V/m"
            metricKey="ElectricField"
            tips={["Unplug non-essentials at night.", "Keep cords off headboard walls."]}
          />
          <MetricCard
            label="Radio Frequency"
            value={M.RF}
            unit="mW/m²"
            metricKey="RF"
            tips={["Relocate router 6–10 ft from beds.", "Schedule nighttime Wi-Fi off."]}
          />
        </div>
      </Section>

      {/* PAGE 3 – COMPARISONS (PM & CO2 only) */}
      <Section
        id="compare"
        title="How Your Home Compares"
        subtitle="Houston averages, national standards, and SaSo benchmarks."
      >
        <div className="grid gap-6 lg:grid-cols-3">
          {/* PM2.5 */}
          <motion.div
            className="lg:col-span-1"
            whileHover={{ rotateX: 2, rotateY: -2 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ transformPerspective: 800 }}
          >
            <Card className="">
              <div className="mb-3 text-sm font-semibold">PM₂.₅ (µg/m³)</div>
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <BarChart data={pm25Compare} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, Math.max(18, (M.PM25 ?? 0) + 3)]} />
                    <Tooltip formatter={(v: number) => `${v} µg/m³`} cursor={{ fill: "rgba(2,6,23,0.03)" }} />
                    <ReferenceLine
                      y={HOUSTON_REFERENCES.pm25Benchmark}
                      stroke={brand.accent}
                      strokeDasharray="4 4"
                      label={{ position: "right", value: "EPA 2024 Std (9)" }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {pm25Compare.map((entry, i) => (
                        <Cell key={`c-${i}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>

          {/* PM10 */}
          <motion.div
            className="lg:col-span-1"
            whileHover={{ rotateX: 2, rotateY: -2 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ transformPerspective: 800 }}
          >
            <Card className="">
              <div className="mb-3 text-sm font-semibold">PM₁₀ (µg/m³)</div>
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <BarChart data={pm10Compare} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, Math.max(60, (M.PM10 ?? 0) + 10)]} />
                    <Tooltip formatter={(v: number) => `${v} µg/m³`} cursor={{ fill: "rgba(2,6,23,0.03)" }} />
                    <ReferenceLine
                      y={HOUSTON_REFERENCES.pm10Benchmark}
                      stroke={brand.accent}
                      strokeDasharray="4 4"
                      label={{ position: "right", value: "SaSo Benchmark (30)" }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {pm10Compare.map((entry, i) => (
                        <Cell key={`c-${i}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>

          {/* CO2 */}
          <motion.div
            className="lg:col-span-1"
            whileHover={{ rotateX: 2, rotateY: -2 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ transformPerspective: 800 }}
          >
            <Card className="">
              <div className="mb-3 text-sm font-semibold">CO₂ (ppm)</div>
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <BarChart data={co2Compare} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, Math.max(1600, (M.CO2 ?? 0) + 200)]} />
                    <Tooltip formatter={(v: number) => `${v} ppm`} cursor={{ fill: "rgba(2,6,23,0.03)" }} />
                    <ReferenceLine
                      y={HOUSTON_REFERENCES.co2Benchmark}
                      stroke={brand.accent}
                      strokeDasharray="4 4"
                      label={{ position: "right", value: "SaSo Good (≤800)" }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {co2Compare.map((entry, i) => (
                        <Cell key={`c-${i}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>
        </div>
      </Section>

      {/* PAGE 4 – ACTION PLAN */}
      <Section
        id="action"
        title="Your Action Plan"
        subtitle="Practical steps you can start today. We’ll verify results on re-test."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <div className="mb-2 text-sm font-semibold">Immediate (Within 7 Days)</div>
            <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
              <li>
                Replace HVAC filter with <strong>MERV 13</strong> or better; seal filter bypass gaps.
              </li>
              <li>
                Run a <strong>HEPA purifier</strong> in the bedroom overnight and living area during use.
              </li>
              <li>Ventilate workspace 10 min/hr or use ERV/HRV while occupied.</li>
              <li>Flush taps each morning; fill filtered pitcher for the day.</li>
            </ul>
            <div className="my-4 h-px w-full bg-slate-200" />
            <div className="mb-2 text-sm font-semibold">Short-Term (1–3 Months)</div>
            <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
              <li>Install under-sink <strong>RO</strong> system and carbon polishing filter.</li>
              <li>Add in-duct filtration/media cabinet for lower pressure drop.</li>
              <li>Place a CO₂ + PM monitor in office to validate improvements.</li>
            </ul>
          </Card>

          <Card>
            <div className="mb-2 text-sm font-semibold">SaSo Recommendations</div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-200">
                    <td className="px-3 py-2">BlueAir 211+ (HEPA)</td>
                    <td className="px-3 py-2">Portable filtration for living area</td>
                  </tr>
                  <tr className="border-t border-slate-200">
                    <td className="px-3 py-2">Aquasana Claryum RO</td>
                    <td className="px-3 py-2">Under-sink drinking water filtration</td>
                  </tr>
                  <tr className="border-t border-slate-200">
                    <td className="px-3 py-2">Airthings / Awair Element</td>
                    <td className="px-3 py-2">Indoor PM + CO₂ tracking</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Add your affiliate URLs later; this section will auto-link items for one-click purchase.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <motion.button
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
              >
                Book Re-Test
              </motion.button>
              <motion.button
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
              >
                Chat with a Technician
              </motion.button>
            </div>
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
          a::after { content: ""; }
          .shadow, .ring-1, .border { box-shadow: none !important; }
          .bg-gradient-to-b { background: white !important; }
        }
      `}</style>
    </div>
  );
}
