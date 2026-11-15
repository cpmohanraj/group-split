import { NextResponse } from "next/server";
import { authorizationUrl, newPending } from "@/lib/google";
import { savePending } from "@/lib/pending";

export const dynamic = "force-dynamic";

export async function GET() {
  const p = newPending();
  await savePending(p);
  return NextResponse.redirect(authorizationUrl(p), { headers: { "Cache-Control": "no-store" } });
}
