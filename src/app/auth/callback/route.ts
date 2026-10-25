import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing point for the link in Supabase emails (password reset).
// Swaps the one-time `code` for a logged-in session, then moves on.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/books";
  // Only allow redirects within this app
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/books";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/forgot-password?error=link`);
}
