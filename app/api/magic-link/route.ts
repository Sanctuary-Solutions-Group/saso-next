// app/api/magic-link/route.ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  try {
    const { property_id } = await request.json();

    if (!property_id) {
      return NextResponse.json(
        { error: "property_id is required" },
        { status: 400 }
      );
    }

    // 1. Generate token
    const token = randomUUID().replace(/-/g, "");

    // 2. Expiration — 30 days from now
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 30);

    // 3. Insert magic link record
    const { data, error } = await supabase
      .from("report_access")
      .insert({
        property_id,
        token,
        expires_at,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 4. Return the URL the client can use
    const url = `${process.env.NEXT_PUBLIC_SITE_URL}/report?t=${token}`;

    return NextResponse.json({
      success: true,
      link: url,
      token,
      expires_at,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
