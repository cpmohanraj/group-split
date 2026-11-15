import { VerifyForm } from "@/components/VerifyForm";

export const dynamic = "force-dynamic";

export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <main className="wrap center">
      <div className="card">
        <h1>{process.env.GROUP_NAME || "Pickleball"}</h1>
        <p className="muted">Tap continue to finish signing in on this device.</p>
        <VerifyForm token={token} />
      </div>
    </main>
  );
}
