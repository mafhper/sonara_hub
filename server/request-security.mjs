const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const loopbackHosts = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
const jobStatusPath =
  /^\/api\/jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const inputAssetPath = /^\/api\/input-asset\/[^/]+$/u;

export function enforceLocalMutationOrigin(req, res, next) {
  if (safeMethods.has(String(req.method ?? "GET").toUpperCase())) {
    return next();
  }

  const fetchSite = String(req.get?.("sec-fetch-site") ?? "").toLowerCase();
  if (fetchSite === "cross-site") {
    return res.status(403).json({ error: "cross-site-request-blocked" });
  }

  const origin = req.get?.("origin");
  if (!origin) return next();

  try {
    const url = new URL(origin);
    if (
      ["http:", "https:"].includes(url.protocol) &&
      loopbackHosts.has(url.hostname.toLowerCase())
    ) {
      return next();
    }
  } catch {
    // Invalid and opaque origins are not trusted for state-changing requests.
  }

  return res.status(403).json({ error: "untrusted-origin" });
}

export function isLoopbackHttpUrl(value) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      loopbackHosts.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function isReadOnlyJobStatusRequest(req) {
  if (String(req.method ?? "GET").toUpperCase() !== "GET") return false;
  const pathname = String(req.originalUrl ?? req.url ?? "").split("?", 1)[0];
  return jobStatusPath.test(pathname);
}

export function isReadOnlyInputAssetRequest(req) {
  if (String(req.method ?? "GET").toUpperCase() !== "GET") return false;
  const pathname = String(req.originalUrl ?? req.url ?? "").split("?", 1)[0];
  return inputAssetPath.test(pathname);
}
