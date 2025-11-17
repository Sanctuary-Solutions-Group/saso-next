"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { SaInput } from "@/components/SaInput";

export default function NewProperty() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  const defaultRooms = [
    { name: "Primary Bedroom", type: "bedroom" },
    { name: "Bedroom 2", type: "bedroom" },
    { name: "Bedroom 3", type: "bedroom" },
    { name: "Kitchen", type: "kitchen" },
    { name: "Living Room", type: "living" },
  ];

  function setField(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);

    try {
      // INSERT PROPERTY
      const { data: prop, error: propError } = await supabase
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

      if (propError) throw propError;
      const propertyId = prop.id;

      // INSERT DEFAULT ROOMS
      const roomsPayload = defaultRooms.map((r, index) => ({
        property_id: propertyId,
        name: r.name,
        type: r.type,
        order_index: index,
      }));

      const { error: roomsError } = await supabase
        .from("room")
        .insert(roomsPayload);

      if (roomsError) throw roomsError;

      showToast("Property created. Redirecting…");

      setTimeout(() => router.push(`/technician/${propertyId}`), 900);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create property");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
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
                Technician Workspace
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-4 text-xs text-slate-500 md:flex">
            <Link href="/technician" className="hover:text-slate-900">
              Dashboard
            </Link>
            <span className="font-medium text-slate-900">New Property</span>
            <Link href="/report" className="hover:text-slate-900">
              Client Report
            </Link>
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link
          href="/technician"
          className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
        >
          ← Back to Dashboard
        </Link>

        <div className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            New Assessment
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Add New Property
          </h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">
            Enter essential property details. Default rooms will be created
            automatically so you can begin collecting Air, Water, and Ether
            measurements immediately.
          </p>
        </div>

        {/* FORM */}
        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-10 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm"
        >
          {/* PROPERTY INFO */}
          <section>
            <h2 className="text-sm font-semibold text-slate-900">
              Property Information
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Basic details about the home.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Address
                </label>
                <SaInput
                  demo="123 Main St"
                  value={form.address}
                  onChange={(v) => setField("address", v)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  City
                </label>
                <SaInput
                  demo="Houston"
                  value={form.city}
                  onChange={(v) => setField("city", v)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  State
                </label>
                <SaInput
                  demo="TX"
                  value={form.state}
                  onChange={(v) => setField("state", v)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  ZIP
                </label>
                <SaInput
                  demo="77007"
                  value={form.zip}
                  onChange={(v) => setField("zip", v)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Square Feet
                </label>
                <SaInput
                  demo="2600"
                  type="number"
                  value={form.sqft}
                  onChange={(v) => setField("sqft", v)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Year Built
                </label>
                <SaInput
                  demo="2016"
                  type="number"
                  value={form.year_built}
                  onChange={(v) => setField("year_built", v)}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Primary Contact Email
                </label>
                <SaInput
                  demo="client@example.com"
                  type="email"
                  value={form.primary_contact_email}
                  onChange={(v) => setField("primary_contact_email", v)}
                />
              </div>
            </div>
          </section>

          {/* OCCUPANTS */}
          <section>
            <h2 className="text-sm font-semibold text-slate-900">
              Occupant Information
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Helps tailor environmental recommendations.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Adults
                </label>
                <SaInput
                  numericSelect
                  value={form.occupants_adults}
                  onChange={(v) => setField("occupants_adults", v)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Children
                </label>
                <SaInput
                  numericSelect
                  value={form.occupants_children}
                  onChange={(v) => setField("occupants_children", v)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Animals
                </label>
                <SaInput
                  numericSelect
                  value={form.occupants_animals}
                  onChange={(v) => setField("occupants_animals", v)}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-6 text-xs text-slate-700">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.occupants_allergies}
                  onChange={(e) =>
                    setField("occupants_allergies", e.target.checked)
                  }
                  className="h-3 w-3 rounded border-slate-300 text-blue-600"
                />
                <span>Allergies present</span>
              </label>

              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.occupants_asthma}
                  onChange={(e) =>
                    setField("occupants_asthma", e.target.checked)
                  }
                  className="h-3 w-3 rounded border-slate-300 text-blue-600"
                />
                <span>Asthma present</span>
              </label>
            </div>
          </section>

          {/* ERROR */}
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* ACTIONS */}
          <div className="flex gap-3">
            <Link
              href="/technician"
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create Property"}
            </button>
          </div>
        </form>
      </main>

      {toast && (
        <div className="fixed right-4 top-4 z-50 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
