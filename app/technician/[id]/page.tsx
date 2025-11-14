"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ───────────────────────────────────────────────
type Property = {
  id: string;
  name: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  created_at: string;
};

type Room = {
  id: string;
  name: string;
  type: string;
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

// ─── Metric Options by Category ───────────────────────────
const metricOptions: Record<string, { metric: string; unit: string }[]> = {
  air: [
    { metric: "CO2", unit: "ppm" },
    { metric: "PM2.5", unit: "µg/m³" },
    { metric: "PM10", unit: "µg/m³" },
    { metric: "VOCs", unit: "ppb" },
    { metric: "Humidity", unit: "%" },
    { metric: "Temperature", unit: "°F" },
  ],
  water: [
    { metric: "TDS", unit: "ppm" },
    { metric: "Free Chlorine", unit: "ppm" },
    { metric: "pH", unit: "" },
  ],
  ether: [
    { metric: "Mag Field", unit: "mG" },
    { metric: "Electric Field", unit: "V/m" },
    { metric: "RF", unit: "mW/m²" },
  ],
};

// ─── Component ────────────────────────────────────────────
export default function PropertyDetail() {
  const params = useParams();
  const propertyId = params.id as string;

  const [property, setProperty] = useState<Property | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);

  const [newRoom, setNewRoom] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);

  const [form, setForm] = useState({
    room_id: "",
    category: "air",
    metric: "",
    value: "",
    unit: "",
    notes: "",
  });

  // ─── Fetch Data ────────────────────────────────────────
  useEffect(() => {
    fetchData();
  }, [propertyId]);

  async function fetchData() {
    setLoading(true);
    const { data: prop } = await supabase.from("property").select("*").eq("id", propertyId).single();
    setProperty(prop || null);

    const { data: rms } = await supabase.from("room").select("*").eq("property_id", propertyId).order("created_at");
    setRooms(rms || []);

    const { data: ms } = await supabase
      .from("measurement")
      .select("*")
      .eq("property_id", propertyId)
      .order("taken_at", { ascending: false });
    setMeasurements(ms || []);
    setLoading(false);
  }

  // ─── Add / Delete Room ─────────────────────────────────
  async function handleAddRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoom.trim()) return;
    setAddingRoom(true);
    const { data, error } = await supabase
      .from("room")
      .insert({ property_id: propertyId, name: newRoom.trim(), type: "other" })
      .select("*")
      .single();
    if (!error && data) setRooms((prev) => [...prev, data]);
    setNewRoom("");
    setAddingRoom(false);
  }

  async function handleDeleteRoom(id: string) {
    if (!confirm("Delete this room?")) return;
    const { error } = await supabase.from("room").delete().eq("id", id);
    if (!error) setRooms((prev) => prev.filter((r) => r.id !== id));
  }

  // ─── Handle Measurement Form ───────────────────────────
  function handleCategoryChange(category: string) {
    const firstMetric = metricOptions[category][0];
    setForm((prev) => ({
      ...prev,
      category,
      metric: firstMetric.metric,
      unit: firstMetric.unit,
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
      unit: form.unit,
      notes: form.notes || null,
    };
    const { data, error } = await supabase.from("measurement").insert(payload).select("*").single();
    if (!error && data) setMeasurements((prev) => [data, ...prev]);
    setForm({ ...form, value: "", notes: "" });
  }

  // ─── Render ────────────────────────────────────────────
  if (loading || !property)
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">
        <div className="loader mr-2 border-2" /> Loading property…
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--bg-gradient-from)] to-[var(--bg-gradient-to)]">
      <div className="container py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-6">
          <div>
            <h1 className="text-2xl font-semibold">{property.name || "Untitled Property"}</h1>
            <p className="text-sm text-[var(--muted)]">
              {[property.address_line1, property.city, property.state].filter(Boolean).join(", ")}
            </p>
          </div>
          <Link
            href="/technician"
            className="text-[var(--muted)] hover:text-[var(--brand)] transition flex items-center"
          >
            ← Back to Properties
          </Link>
        </div>

        {/* ─── Room Management ─────────────────────── */}
        <div className="card mb-10 border border-slate-100">
          <h2 className="h2 mb-3">Rooms</h2>
          <form onSubmit={handleAddRoom} className="flex flex-col sm:flex-row gap-2 mb-6">
            <input
              value={newRoom}
              onChange={(e) => setNewRoom(e.target.value)}
              placeholder="Add new room..."
              className="input flex-1"
              disabled={addingRoom}
            />
            <button className="btn sm:w-auto" disabled={addingRoom || !newRoom.trim()}>
              {addingRoom ? "Adding..." : "Add Room"}
            </button>
          </form>

          {rooms.length === 0 ? (
            <p className="subtle">No rooms yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="flex justify-between items-center bg-white border border-slate-100 rounded-xl p-3 hover:border-[var(--brand-light)] transition"
                >
                  <span>{room.name}</span>
                  <button
                    onClick={() => handleDeleteRoom(room.id)}
                    className="text-[var(--muted)] hover:text-red-500 transition"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Measurement Form ─────────────────────── */}
        <div className="card mb-10 border border-slate-100">
          <h2 className="h2 mb-4">Add Measurement</h2>
          <form onSubmit={handleAddMeasurement} className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <select
              value={form.room_id}
              onChange={(e) => setForm({ ...form, room_id: e.target.value })}
              className="select"
              required
            >
              <option value="">Select Room</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            <select
              value={form.category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="select"
            >
              <option value="air">Air</option>
              <option value="water">Water</option>
              <option value="ether">Ether</option>
            </select>

            <select
              value={form.metric}
              onChange={(e) => {
                const selected = metricOptions[form.category].find((m) => m.metric === e.target.value);
                setForm({
                  ...form,
                  metric: e.target.value,
                  unit: selected ? selected.unit : "",
                });
              }}
              className="select"
            >
              {metricOptions[form.category].map((m) => (
                <option key={m.metric} value={m.metric}>
                  {m.metric}
                </option>
              ))}
            </select>

            <input
              placeholder="Value"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              type="number"
              step="any"
              className="input"
              required
            />

            <input
              placeholder="Unit"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className="input"
            />

            <input
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input col-span-full"
            />

            <button type="submit" className="btn col-span-full sm:col-span-1">
              Add Measurement
            </button>
          </form>
        </div>

        {/* ─── Measurement Table ─────────────────────── */}
        <div className="card border border-slate-100">
          <h2 className="h2 mb-4">Measurements</h2>
          {measurements.length === 0 ? (
            <p className="subtle">No measurements logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead className="bg-gray-100 text-left">
                  <tr>
                    <th className="py-2 px-3 border-b">Room</th>
                    <th className="py-2 px-3 border-b">Category</th>
                    <th className="py-2 px-3 border-b">Metric</th>
                    <th className="py-2 px-3 border-b">Value</th>
                    <th className="py-2 px-3 border-b">Unit</th>
                    <th className="py-2 px-3 border-b">Notes</th>
                    <th className="py-2 px-3 border-b">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {measurements.map((m) => {
                    const room = rooms.find((r) => r.id === m.room_id);
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="py-2 px-3 border-b">{room ? room.name : "—"}</td>
                        <td className="py-2 px-3 border-b capitalize">{m.category}</td>
                        <td className="py-2 px-3 border-b">{m.metric}</td>
                        <td className="py-2 px-3 border-b">{m.value}</td>
                        <td className="py-2 px-3 border-b">{m.unit}</td>
                        <td className="py-2 px-3 border-b">{m.notes || "—"}</td>
                        <td className="py-2 px-3 border-b text-[var(--muted)]">
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
    </div>
  );
}
