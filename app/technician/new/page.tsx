"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

export default function NewProperty() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    address: "",
    city: "",
    state: "TX",
    zip: "",
    sqft: "",
    year_built: "",
    primary_contact_email: "",
    occupants_adults: "",
    occupants_children: "",
    occupants_animals: "",
    occupants_allergies: false,
    occupants_asthma: false,
  });

  const defaultRooms = [
    { name: "Master Bedroom", type: "bedroom" },
    { name: "Bedroom 1", type: "bedroom" },
    { name: "Bedroom 2", type: "bedroom" },
    { name: "Bedroom 3", type: "bedroom" },
    { name: "Kitchen", type: "kitchen" },
    { name: "Living Room", type: "living" },
  ];

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      // 1️⃣ Insert property
      const { data: property, error: propertyError } = await supabase
        .from("property")
        .insert({
          address: form.address || null,
          city: form.city || null,
          state: form.state || null,
          zip: form.zip || null,
          sqft: form.sqft ? parseInt(form.sqft) : null,
          year_built: form.year_built ? parseInt(form.year_built) : null,
          primary_contact_email: form.primary_contact_email || null,
          occupants_adults: form.occupants_adults
            ? parseInt(form.occupants_adults)
            : null,
          occupants_children: form.occupants_children
            ? parseInt(form.occupants_children)
            : null,
          occupants_animals: form.occupants_animals
            ? parseInt(form.occupants_animals)
            : null,
          occupants_allergies: form.occupants_allergies,
          occupants_asthma: form.occupants_asthma,
        })
        .select("id")
        .single();

      if (propertyError) throw propertyError;

      const propertyId = property.id;

      // 2️⃣ Add default rooms
      const roomPayload = defaultRooms.map((r, i) => ({
        property_id: propertyId,
        name: r.name,
        type: r.type,
        order_index: i,
      }));

      const { error: roomError } = await supabase.from("room").insert(roomPayload);
      if (roomError) throw roomError;

      // 3️⃣ Redirect
      router.push(`/technician/${propertyId}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create property");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Link
          href="/technician"
          className="text-blue-600 hover:underline text-sm"
        >
          ← Back to Properties
        </Link>

        <h1 className="text-2xl font-semibold mt-4 mb-1">
          Add New Property
        </h1>
        <p className="text-gray-500 mb-8">
          Enter property and occupant details. Default rooms will be added
          automatically.
        </p>

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow rounded-lg p-6 space-y-8 border border-gray-100"
        >
          {/* ───── Property Info ───── */}
          <div>
            <h2 className="text-lg font-medium mb-3">Property Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Address</label>
                <input
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  className="w-full border rounded-md p-2"
                  placeholder="123 Main St"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">City</label>
                <input
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  className="w-full border rounded-md p-2"
                  placeholder="City"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">State</label>
                <input
                  name="state"
                  value={form.state}
                  onChange={handleChange}
                  maxLength={2}
                  className="w-full border rounded-md p-2 uppercase"
                  placeholder="TX"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ZIP</label>
                <input
                  name="zip"
                  value={form.zip}
                  onChange={handleChange}
                  className="w-full border rounded-md p-2"
                  placeholder="77433"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Square Feet
                </label>
                <input
                  name="sqft"
                  value={form.sqft}
                  onChange={handleChange}
                  type="number"
                  className="w-full border rounded-md p-2"
                  placeholder="2600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Year Built
                </label>
                <input
                  name="year_built"
                  value={form.year_built}
                  onChange={handleChange}
                  type="number"
                  className="w-full border rounded-md p-2"
                  placeholder="2016"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">
                  Contact Email
                </label>
                <input
                  name="primary_contact_email"
                  value={form.primary_contact_email}
                  onChange={handleChange}
                  type="email"
                  className="w-full border rounded-md p-2"
                  placeholder="demo@saso.com"
                />
              </div>
            </div>
          </div>

          {/* ───── Occupant Info ───── */}
          <div>
            <h2 className="text-lg font-medium mb-3">Occupant Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Adults
                </label>
                <input
                  name="occupants_adults"
                  value={form.occupants_adults}
                  onChange={handleChange}
                  type="number"
                  className="w-full border rounded-md p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Children
                </label>
                <input
                  name="occupants_children"
                  value={form.occupants_children}
                  onChange={handleChange}
                  type="number"
                  className="w-full border rounded-md p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Animals
                </label>
                <input
                  name="occupants_animals"
                  value={form.occupants_animals}
                  onChange={handleChange}
                  type="number"
                  className="w-full border rounded-md p-2"
                />
              </div>
            </div>

            <div className="flex gap-8 mt-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="occupants_allergies"
                  checked={form.occupants_allergies}
                  onChange={handleChange}
                />
                <span className="text-sm">Allergies Present</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="occupants_asthma"
                  checked={form.occupants_asthma}
                  onChange={handleChange}
                />
                <span className="text-sm">Asthma Present</span>
              </label>
            </div>
          </div>

          {/* ───── Error Message ───── */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-md p-3 text-sm">
              {error}
            </div>
          )}

          {/* ───── Submit Buttons ───── */}
          <div className="flex gap-3">
            <Link
              href="/technician"
              className="border border-gray-300 rounded-md px-4 py-2 text-sm hover:bg-gray-100"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Creating..." : "Create Property"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
