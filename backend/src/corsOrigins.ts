export function parseOriginList(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[\s,]+/).map((item) => item.trim().replace(/\/$/, "")).filter(Boolean))];
}

export function configuredOrigins(): string[] {
  return parseOriginList(process.env.FRONTEND_URL);
}

export function isAllowedOrigin(origin: string | undefined, allowed = configuredOrigins()): boolean {
  if (!origin) return false;
  const request = origin.replace(/\/$/, "");
  if (allowed.includes(request)) return true;

  let requestUrl: URL;
  try {
    requestUrl = new URL(request);
  } catch {
    return false;
  }
  if (requestUrl.protocol !== "https:") return false;

  for (const candidate of allowed) {
    let allowedUrl: URL;
    try {
      allowedUrl = new URL(candidate);
    } catch {
      continue;
    }
    if (requestUrl.origin === allowedUrl.origin) return true;
    if (!allowedUrl.hostname.endsWith(".vercel.app")) continue;
    if (!requestUrl.hostname.endsWith(".vercel.app")) continue;
    const project = allowedUrl.hostname.split("-")[0];
    if (!project) continue;
    if (
      requestUrl.hostname === `${project}.vercel.app` ||
      requestUrl.hostname.startsWith(`${project}-`)
    ) {
      return true;
    }
  }
  return false;
}
