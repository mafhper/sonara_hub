const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const loopbackHosts = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

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
