const currency = process.env.NEXT_PUBLIC_CURRENCY || "AUD";
const fmt = new Intl.NumberFormat("en-AU", { style: "currency", currency });

export const money = (cents: number) => fmt.format(cents / 100);
export const dollars = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, "");

export function niceDate(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
