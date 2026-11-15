import { NextResponse } from "next/server";
import { authorizationUrl, newPending } from "@/lib/google";
import { savePending } from "@/lib/pending";
import { appUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error("Google sign-in is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)");
    return NextResponse.redirect(new URL("/?error=setup", appUrl()), { headers: { "Cache-Control": "no-store" } });
  }
  const p = newPending();
  await savePending(p);
  return NextResponse.redirect(authorizationUrl(p), { headers: { "Cache-Control": "no-store" } });
}
