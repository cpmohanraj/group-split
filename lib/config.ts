export const config = {
  groupName: process.env.GROUP_NAME || "Pickleball",
  timezone: process.env.TIMEZONE || "Australia/Perth",
};

export function todayISO(): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(new Date());
}

/** The trusted public origin for links. Never derived from request headers (host-header injection). */
export function appUrl(): string {
  const url =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  if (!url) throw new Error("APP_URL is not set");
  return url.replace(/\/$/, "");
}
