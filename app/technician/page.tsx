"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type Property = {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sqft: number | null;
  year_built: number | null;
  primary_contact_email: string | null;
  created_at: string;
};

export default function TechnicianDashboard() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProperties();
  }, []);

  async function fetchProperties() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("property")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setError("Unable to load properties.");
      setProperties([]);
    } else {
      setProperties(data || []);
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* HEADER (SaSo-style) */}
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
            <span className="font-medium text-slate-900">Dashboard</span>
            <Link href="/technician/new" className="hover:text-slate-900">
              New Property
            </Link>
            <Link href="/report" className="hover:text-slate-900">
              Client Report
            </Link>
          </nav>
        </div>
      </header>

      {/* MAIN */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Header Row */}
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Overview
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Technician Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500 max-w-md">
              Configure properties and capture on-site measurements before generating client-facing Home Health Reports.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={fetchProperties}
              className="hidden rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900 md:inline-flex"
            >
              Refresh
            </button>
            <Link
              href="/technician/new"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
            >
              + New Property
            </Link>
          </div>
        </div>

        {/* Properties Card */}
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Properties
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Select a property to begin capturing room-by-room measurements.
              </p>
            </div>

            {properties.length > 0 && (
              <span className="text-[11px] text-slate-500">
                {properties.length} property{properties.length > 1 ? " entries" : ""}
              </span>
            )}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              Loading properties…
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && properties.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">
                No properties yet.
              </p>
              <p className="mt-1 text-xs text-slate-500 max-w-sm">
                Create your first property to begin a new environmental assessment.
              </p>

              <Link
                href="/technician/new"
                className="mt-4 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
              >
                Create first property
              </Link>
            </div>
          )}

          {/* Property Grid */}
          {!loading && !error && properties.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {properties.map((p) => {
                const address = p.address || "Unnamed property";
                const cityLine = [p.city, p.state, p.zip].filter(Boolean).join(", ");

                return (
                  <button
                    key={p.id}
                    onClick={() => router.push(`/technician/${p.id}`)}
                    className="flex flex-col rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm shadow-sm transition hover:border-blue-100 hover:bg-blue-50/40 hover:shadow-md"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <div className="truncate text-[13px] font-semibold text-slate-900">
                        {address}
                      </div>
                      <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        {new Date(p.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="truncate text-[12px] text-slate-600">
                      {cityLine || "Location not provided"}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                      {p.sqft && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                          {p.sqft.toLocaleString()} sqft
                        </span>
                      )}

                      {p.year_built && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                          Built {p.year_built}
                        </span>
                      )}

                      {p.primary_contact_email && (
                        <span className="max-w-[180px] truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                          {p.primary_contact_email}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
