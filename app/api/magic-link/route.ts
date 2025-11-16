// app/api/generate-link/route.ts
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

    const token = randomUUID().replace(/-/g, "");

    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 30);

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

    return NextResponse.json({
      ok: true,
      token,
      link: `${process.env.NEXT_PUBLIC_SITE_URL}/report?token=${token}`,
      expires_at,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
