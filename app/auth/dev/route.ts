import { NextResponse, type NextRequest } from "next/server";
import { devSignIn } from "@/lib/auth";

// Local development only: /auth/dev?email=... (requires NODE_ENV=development and DEV_LOGIN=1).
export async function GET(req: NextRequest) {
  const ok = await devSignIn(req.nextUrl.searchParams.get("email") ?? "");
  if (!ok) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(new URL("/", req.url));
}
