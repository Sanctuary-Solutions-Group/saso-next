"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { SaInput } from "@/components/SaInput";

/* ============================================================
   Metric Definitions
   Pretty label (UI) → raw key (DB) → locked unit
   ============================================================ */

const metricOptions: Record<
  "air" | "water" | "ether",
  { key: string; label: string; unit: string }[]
> = {
  air: [
    { key: "CO2", label: "CO₂", unit: "ppm" },
    { key: "PM25", label: "PM₂.₅", unit: "µg/m³" },
    { key: "PM10", label: "PM₁₀", unit: "µg/m³" },
    { key: "VOCs", label: "VOCs", unit: "ppb" },
    { key: "Humidity", label: "Humidity", unit: "%" },
    { key: "Temp", label: "Temperature", unit: "°F" },
  ],

  water: [
    { key: "TDS", label: "Total Dissolved Solids (TDS)", unit: "ppm" },
    { key: "Cl", label: "Free Chlorine", unit: "ppm" },
    { key: "pH", label: "pH", unit: "" },
  ],

  ether: [
    { key: "MagField", label: "Magnetic Field (ELF)", unit: "mG" },
    { key: "ElectricField", label: "Electric Field", unit: "V/m" },
    { key: "RF", label: "Radiofrequency (RF)", unit: "mW/m²" },
  ],
};

/* ============================================================
   Types
   ============================================================ */

type Property = {
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
  created_at: string;
};

type Room = {
  id: string;
  name: string;
  type: string | null;
  order_index: number | null;
  property_id: string;
  created_at: string;
};

type Measurement = {
  id: string;
  property_id: string;
  room_id: string;
  category: string;
  metric: string;
  value: number;
  unit: string;
  notes: string | null;
  taken_at: string;
};

/* ============================================================
   Component
   ============================================================ */

export default function PropertyDetail() {
  const params = useParams();
  const propertyId = params.id as string;

  const [property, setProperty] = useState<Property | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const [newRoom, setNewRoom] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);

  const [form, setForm] = useState({
    room_id: "",
    category: "air",
    metric: metricOptions.air[0].key,
    unit: metricOptions.air[0].unit,
    value: "",
    notes: "",
  });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  /* ============================================================
     Fetch data
     ============================================================ */

  useEffect(() => {
    fetchAll();
  }, [propertyId]);

  async function fetchAll() {
    setLoading(true);

    const { data: prop } = await supabase
      .from("property")
      .select("*")
      .eq("id", propertyId)
      .single();
    setProperty(prop || null);

    const { data: rms } = await supabase
      .from("room")
      .select("*")
      .eq("property_id", propertyId)
      .order("order_index", { ascending: true });
    setRooms(rms || []);

    const { data: ms } = await supabase
      .from("measurement")
      .select("*")
      .eq("property_id", propertyId)
      .order("taken_at", { ascending: false });
    setMeasurements(ms || []);

    setLoading(false);
  }

  /* ============================================================
     Room Management
     ============================================================ */

  async function handleAddRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoom.trim()) return;

    setAddingRoom(true);

    const { data, error } = await supabase
      .from("room")
      .insert({
        property_id: propertyId,
        name: newRoom.trim(),
        type: "other",
        order_index: rooms.length,
      })
      .select("*")
      .single();

    if (!error && data) {
      setRooms((prev) => [...prev, data]);
      showToast("Room added.");
      setNewRoom("");
    }

    setAddingRoom(false);
  }

  async function handleDeleteRoom(id: string) {
    if (!confirm("Delete this room?")) return;

    const { error } = await supabase.from("room").delete().eq("id", id);
    if (!error) {
      setRooms((prev) => prev.filter((r) => r.id !== id));
      showToast("Room deleted.");
    }
  }

  /* ============================================================
     Measurement Logic
     ============================================================ */

  function handleCategoryChange(newCat: "air" | "water" | "ether") {
    const defaultMetric = metricOptions[newCat][0];

    setForm((prev) => ({
      ...prev,
      category: newCat,
      metric: defaultMetric.key,
      unit: defaultMetric.unit,
    }));
  }

  function handleMetricChange(newKey: string) {
    const selected = [
      ...metricOptions.air,
      ...metricOptions.water,
      ...metricOptions.ether,
    ].find((m) => m.key === newKey);

    if (!selected) return;

    setForm((prev) => ({
      ...prev,
      metric: selected.key,
      unit: selected.unit,
    }));
  }

  async function handleAddMeasurement(e: React.FormEvent) {
    e.preventDefault();

    if (!form.room_id || !form.metric || !form.value) return;

    const payload = {
      property_id: propertyId,
      room_id: form.room_id,
      category: form.category,
      metric: form.metric,
      value: parseFloat(form.value),
      unit: form.unit, // always locked
      notes: form.notes || null,
    };

    const { data, error } = await supabase
      .from("measurement")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.error("Insert error:", error);
      showToast("Error adding measurement");
      return;
    }

    if (data) {
      setMeasurements((prev) => [data, ...prev]);
      showToast("Measurement added.");
      setForm((prev) => ({ ...prev, value: "", notes: "" }));
    }
  }

  /* ============================================================
     Render
     ============================================================ */

  if (loading || !property) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
      </div>
    );
  }

  const addressLine = property.address ?? "Untitled Property";
  const cityLine = [property.city, property.state, property.zip]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 flex items-center justify-center bg-slate-900 text-white text-xs font-bold rounded-xl">
              Sa
            </div>
            <div>
              <div className="text-xs tracking-[0.18em] font-semibold text-slate-500 uppercase">
                Sanctuary Solutions
              </div>
              <div className="text-[13px] font-medium text-slate-800">
                Technician Workspace
              </div>
            </div>
          </div>

          <nav className="hidden md:flex text-xs gap-4 text-slate-500">
            <Link href="/technician" className="hover:text-slate-900">
              Dashboard
            </Link>
            <span className="font-semibold text-slate-900">Property Session</span>
            <Link href="/report" className="hover:text-slate-900">
              Client Report
            </Link>
          </nav>
        </div>
      </header>

      {/* MAIN */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Page header */}
        <div className="mb-6">
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-slate-500">
            Active Property
          </div>
          <h1 className="text-2xl font-semibold mt-1">{addressLine}</h1>
          <p className="text-sm text-slate-500">{cityLine}</p>
        </div>

        {/* Two-column layout */}
        <div className="grid gap-6 lg:grid-cols-[1.8fr_2fr]">

          {/* LEFT COLUMN =================================================== */}
          <div className="space-y-6">

            {/* Rooms */}
            <div className="rounded-2xl bg-white/80 border border-slate-200 shadow-sm p-5">
              <div className="mb-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Rooms
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Add or remove rooms for measurement capture.
                </p>
              </div>

              <form onSubmit={handleAddRoom} className="flex flex-col sm:flex-row gap-2 mb-4">
                <SaInput
                  demo="Add new room…"
                  value={newRoom}
                  onChange={setNewRoom}
                  className="flex-1"
                />

                <button
                  type="submit"
                  disabled={addingRoom || !newRoom.trim()}
                  className="bg-blue-600 text-white text-xs px-4 py-2 rounded-md shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {addingRoom ? "Adding…" : "Add Room"}
                </button>
              </form>

              <div className="grid sm:grid-cols-2 gap-2">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm shadow-sm hover:bg-blue-50/50 hover:border-blue-100"
                  >
                    <span>{room.name}</span>
                    <button
                      onClick={() => handleDeleteRoom(room.id)}
                      className="text-slate-400 hover:text-rose-600 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Capture / Add Measurement */}
            <div className="rounded-2xl bg-white/80 border border-slate-200 shadow-sm p-5">
              <div className="mb-4">
                <div className="text-xs font-semibold tracking-[0.18em] uppercase text-slate-500">
                  Capture
                </div>
                <h2 className="text-sm font-semibold text-slate-900 mt-1">
                  Add Measurement
                </h2>
              </div>

              {/* Category Tabs */}
              <div className="inline-flex mb-4 rounded-full border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
                {(["air", "water", "ether"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleCategoryChange(cat)}
                    className={`px-3 py-1 rounded-full capitalize transition ${
                      form.category === cat
                        ? "bg-white shadow-sm text-slate-900"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Measurement form */}
              <form onSubmit={handleAddMeasurement} className="grid gap-3">

                {/* Room */}
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Room
                  </label>
                  <select
                    value={form.room_id}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, room_id: e.target.value }))
                    }
                    className="w-full border border-slate-300 bg-white px-3 py-2 rounded-md shadow-sm text-sm"
                    required
                  >
                    <option value="">Select room</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Metric */}
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Metric
                  </label>

                  <select
                    value={form.metric}
                    onChange={(e) => handleMetricChange(e.target.value)}
                    className="w-full border border-slate-300 bg-white px-3 py-2 rounded-md shadow-sm text-sm"
                  >
                    {metricOptions[form.category as "air" | "water" | "ether"].map(
                      (m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}
                        </option>
                      )
                    )}
                  </select>
                </div>

                {/* Value */}
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Value
                  </label>
                  <SaInput
                    demo=""
                    type="number"
                    value={form.value}
                    onChange={(v) =>
                      setForm((prev) => ({ ...prev, value: v }))
                    }
                  />
                </div>

                {/* Unit (LOCKED) */}
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Unit
                  </label>
                  <input
                    value={form.unit}
                    disabled
                    className="w-full border border-slate-300 bg-slate-100 text-slate-500 px-3 py-2 rounded-md shadow-sm text-sm cursor-not-allowed"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Notes (optional)
                  </label>
                  <SaInput
                    demo="Any context…"
                    value={form.notes}
                    onChange={(v) =>
                      setForm((prev) => ({ ...prev, notes: v }))
                    }
                  />
                </div>

                {/* Submit */}
                <div className="mt-2">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-4 py-2 text-xs rounded-md shadow-sm hover:bg-blue-700"
                  >
                    Add Measurement
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* RIGHT COLUMN — LOG ======================================== */}
          <div className="rounded-2xl bg-white/80 border border-slate-200 shadow-sm p-5">
            <div className="mb-4 flex justify-between items-center">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Log
                </div>
                <h2 className="text-sm font-semibold text-slate-900 mt-1">
                  Measurements
                </h2>
              </div>

              <span className="text-[11px] text-slate-500">
                {measurements.length} entries
              </span>
            </div>

            {measurements.length === 0 ? (
              <p className="border border-dashed border-slate-200 rounded-md bg-slate-50/60 px-3 py-3 text-xs text-slate-500">
                No measurements yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-500 text-[11px]">
                    <tr>
                      <th className="px-3 py-2 border-b border-slate-200">Room</th>
                      <th className="px-3 py-2 border-b border-slate-200">Category</th>
                      <th className="px-3 py-2 border-b border-slate-200">Metric</th>
                      <th className="px-3 py-2 border-b border-slate-200">Value</th>
                      <th className="px-3 py-2 border-b border-slate-200">Unit</th>
                      <th className="px-3 py-2 border-b border-slate-200">Notes</th>
                      <th className="px-3 py-2 border-b border-slate-200">Time</th>
                    </tr>
                  </thead>

                  <tbody>
                    {measurements.map((m, idx) => {
                      const room = rooms.find((r) => r.id === m.room_id);
                      const prettyName =
                        metricOptions.air.find((x) => x.key === m.metric)?.label ||
                        metricOptions.water.find((x) => x.key === m.metric)?.label ||
                        metricOptions.ether.find((x) => x.key === m.metric)?.label ||
                        m.metric;

                      return (
                        <tr
                          key={m.id}
                          className={idx % 2 ? "bg-slate-50/40" : "bg-white"}
                        >
                          <td className="px-3 py-2 border-b border-slate-100">
                            {room?.name ?? "—"}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 capitalize">
                            {m.category}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100">
                            {prettyName}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100">
                            {m.value}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100">
                            {m.unit}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100">
                            {m.notes || "—"}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap text-[11px] text-slate-500">
                            {new Date(m.taken_at).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {toast && (
        <div className="fixed top-4 right-4 bg-slate-900 text-white text-xs px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
