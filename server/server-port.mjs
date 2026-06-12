const DEFAULT_API_PORT = 4175;
const VITE_DEV_PORT = 5173;

export function resolveServerPort(env = process.env) {
  const explicitApiPort = parsePort(env.SONARA_API_PORT);
  if (explicitApiPort) return explicitApiPort;

  const requestedPort = parsePort(env.PORT) ?? DEFAULT_API_PORT;
  if (
    env.npm_lifecycle_event === "dev:server" &&
    requestedPort === VITE_DEV_PORT
  ) {
    return DEFAULT_API_PORT;
  }
  return requestedPort;
}

function parsePort(value) {
  if (value == null || value === "") return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return undefined;
  return port;
}
