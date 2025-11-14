"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

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
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProperty, setNewProperty] = useState({
    address: "",
    city: "",
    state: "TX",
    zip: "",
    sqft: "",
    year_built: "",
    primary_contact_email: "",
  });
  const router = useRouter();

  // Load properties
  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("property")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) console.error(error);
    else setProperties(data || []);
    setLoading(false);
  };

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    const { address, city, state, zip, sqft, year_built, primary_contact_email } =
      newProperty;

    const { error } = await supabase.from("property").insert([
      {
        address,
        city,
        state,
        zip,
        sqft: sqft ? parseInt(sqft) : null,
        year_built: year_built ? parseInt(year_built) : null,
        primary_contact_email,
      },
    ]);

    if (error) alert("Error creating property: " + error.message);
    else {
      setNewProperty({
        address: "",
        city: "",
        state: "TX",
        zip: "",
        sqft: "",
        year_built: "",
        primary_contact_email: "",
      });
      fetchProperties();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-3xl font-bold mb-6">🏠 Technician Dashboard</h1>

      {/* Create New Property Form */}
      <form
        onSubmit={handleCreateProperty}
        className="bg-white p-6 rounded-lg shadow-md mb-10 max-w-2xl"
      >
        <h2 className="text-xl font-semibold mb-4">Add New Property</h2>
        <div className="grid grid-cols-2 gap-4">
          <input
            placeholder="Address"
            value={newProperty.address}
            onChange={(e) =>
              setNewProperty({ ...newProperty, address: e.target.value })
            }
            className="border p-2 rounded"
            required
          />
          <input
            placeholder="City"
            value={newProperty.city}
            onChange={(e) =>
              setNewProperty({ ...newProperty, city: e.target.value })
            }
            className="border p-2 rounded"
            required
          />
          <input
            placeholder="State"
            value={newProperty.state}
            onChange={(e) =>
              setNewProperty({ ...newProperty, state: e.target.value })
            }
            className="border p-2 rounded"
          />
          <input
            placeholder="ZIP"
            value={newProperty.zip}
            onChange={(e) =>
              setNewProperty({ ...newProperty, zip: e.target.value })
            }
            className="border p-2 rounded"
            required
          />
          <input
            placeholder="Sqft"
            value={newProperty.sqft}
            onChange={(e) =>
              setNewProperty({ ...newProperty, sqft: e.target.value })
            }
            className="border p-2 rounded"
            type="number"
          />
          <input
            placeholder="Year Built"
            value={newProperty.year_built}
            onChange={(e) =>
              setNewProperty({ ...newProperty, year_built: e.target.value })
            }
            className="border p-2 rounded"
            type="number"
          />
          <input
            placeholder="Email"
            value={newProperty.primary_contact_email}
            onChange={(e) =>
              setNewProperty({
                ...newProperty,
                primary_contact_email: e.target.value,
              })
            }
            className="border p-2 rounded col-span-2"
            type="email"
          />
        </div>
        <button
          type="submit"
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Add Property
        </button>
      </form>

      {/* Property List */}
      <h2 className="text-xl font-semibold mb-4">Existing Properties</h2>
      {loading ? (
        <p>Loading...</p>
      ) : properties.length === 0 ? (
        <p>No properties yet.</p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((p) => (
            <div
              key={p.id}
              onClick={() => router.push(`/technician/${p.id}`)}
              className="cursor-pointer bg-white p-4 rounded-lg shadow hover:shadow-lg transition"
            >
              <h3 className="text-lg font-semibold">{p.address}</h3>
              <p className="text-gray-600">
                {p.city}, {p.state} {p.zip}
              </p>
              <p className="text-sm text-gray-400 mt-2">
                Added: {new Date(p.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
