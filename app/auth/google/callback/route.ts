import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, safeEqual } from "@/lib/google";
import { takePending } from "@/lib/pending";
import { signInWithGoogle } from "@/lib/auth";
import { appUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

const home = (error?: string) =>
  NextResponse.redirect(new URL(error ? `/?error=${error}` : "/", appUrl()), { headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const pending = await takePending();
  const state = q.get("state") ?? "";
  const code = q.get("code") ?? "";
  if (q.get("error")) return home("cancelled");
  if (!pending || !state || !safeEqual(state, pending.state) || !code || code.length > 2000) return home("expired");
  try {
    const claims = await exchangeCode(code, pending);
    const result = await signInWithGoogle(claims);
    return home(result === "ok" ? undefined : result);
  } catch (e) {
    console.error("google sign-in failed:", (e as Error).message);
    return home("failed");
  }
}
