import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(appRoot, "public");
const coreFile = resolve(appRoot, "../../packages/sky-zema-core/src/index.js");
const host = "127.0.0.1";
const port = Number.parseInt(process.env.ROCKSTAROS_PREVIEW_PORT ?? "4173", 10);

if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
  throw new Error("ROCKSTAROS_PREVIEW_PORT must be between 1024 and 65535");
}

function telemetryEndpoint() {
  const value = process.env.ROCKSTAROS_TELEMETRY_ENDPOINT?.trim() ?? "";
  if (!value) return "";
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))
  ) {
    throw new Error("ROCKSTAROS_TELEMETRY_ENDPOINT must use HTTPS");
  }
  return url.toString();
}

const endpoint = telemetryEndpoint();
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};
const headers = {
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' https: http://127.0.0.1:* http://localhost:*; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

function sendJson(response, value) {
  response.writeHead(200, { ...headers, "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function fileFor(url) {
  if (url === "/core/index.js") return coreFile;
  const pathname = url === "/" ? "/index.html" : new URL(url, "http://local").pathname;
  const relative = normalize(pathname).replace(/^[/\\]+/, "");
  const candidate = resolve(publicRoot, relative);
  return candidate.startsWith(publicRoot + "/") ? candidate : null;
}

createServer((request, response) => {
  if (!["GET", "HEAD"].includes(request.method ?? "")) {
    response.writeHead(405, headers);
    response.end("Method not allowed");
    return;
  }
  if (request.url === "/config.json") {
    sendJson(response, {
      telemetryAvailable: Boolean(endpoint),
      telemetryEndpoint: endpoint,
      telemetryDefault: false,
    });
    return;
  }
  const file = fileFor(request.url ?? "/");
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404, headers);
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    ...headers,
    "content-type": types[extname(file)] ?? "application/octet-stream",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}).listen(port, host, () => {
  console.log(`RockstarOS public preview: http://${host}:${port}`);
  console.log(
    endpoint
      ? "Anonymous tool-event sharing is available but requires the UI opt-in."
      : "Anonymous tool-event sharing is unavailable until an endpoint is configured.",
  );
});
