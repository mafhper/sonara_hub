import { API_PORT, CLIENT_PORT } from "../ports.mjs";

export function resolveServerPort(env = process.env) {
  const explicitApiPort = parsePort(env.SONARA_API_PORT);
  if (explicitApiPort) return explicitApiPort;

  const requestedPort = parsePort(env.PORT) ?? API_PORT;
  if (
    env.npm_lifecycle_event === "dev:server" &&
    requestedPort === CLIENT_PORT
  ) {
    return API_PORT;
  }
  return requestedPort;
}

function parsePort(value) {
  if (value == null || value === "") return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return undefined;
  return port;
}
