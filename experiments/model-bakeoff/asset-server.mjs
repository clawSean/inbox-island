import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import { once } from "node:events";
import path from "node:path";
import {
  CSP,
  MODEL_ID,
  MODEL_ROOT,
  ORT_ROOT,
  RUNTIME_ROOT,
} from "./support.mjs";

const baseHeaders = Object.freeze({
  "cache-control": "no-store",
  "content-security-policy": CSP,
  "cross-origin-resource-policy": "same-origin",
  "x-content-type-options": "nosniff",
});

function contentType(filePath) {
  if (/\.(?:js|mjs)$/u.test(filePath)) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

function resolveAsset(requestPath) {
  if (requestPath === "/runtime/transformers.webgpu.min.js") {
    return path.join(RUNTIME_ROOT, "transformers.webgpu.min.js");
  }
  if (requestPath.startsWith("/runtime/")) {
    const fileName = path.basename(requestPath);
    if ([
      "ort-wasm-simd-threaded.asyncify.mjs",
      "ort-wasm-simd-threaded.asyncify.wasm",
    ].includes(fileName)) return path.join(ORT_ROOT, fileName);
  }
  if (requestPath.startsWith(`/models/${MODEL_ID}/`)) {
    const relative = decodeURIComponent(requestPath.slice(`/models/${MODEL_ID}/`.length));
    const candidate = path.resolve(MODEL_ROOT, relative);
    if (candidate.startsWith(`${path.resolve(MODEL_ROOT)}${path.sep}`)) return candidate;
  }
  return null;
}

export async function startAssetServer() {
  const requestLog = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/") {
      requestLog.push({ method: request.method, path: url.pathname, status: 200, bytes: 44 });
      response.writeHead(200, { ...baseHeaders, "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><meta charset=utf-8><title>BGE</title>");
      return;
    }
    if (url.pathname === "/favicon.ico") {
      requestLog.push({ method: request.method, path: url.pathname, status: 204, bytes: 0 });
      response.writeHead(204, baseHeaders);
      response.end();
      return;
    }
    const filePath = resolveAsset(url.pathname);
    if (!filePath) {
      requestLog.push({ method: request.method, path: url.pathname, status: 404, bytes: 0 });
      response.writeHead(404, baseHeaders);
      response.end("not found");
      return;
    }
    try {
      const details = await stat(filePath);
      requestLog.push({ method: request.method, path: url.pathname, status: 200, bytes: details.size });
      response.writeHead(200, {
        ...baseHeaders,
        "content-length": details.size,
        "content-type": contentType(filePath),
      });
      createReadStream(filePath).pipe(response);
    } catch {
      requestLog.push({ method: request.method, path: url.pathname, status: 404, bytes: 0 });
      response.writeHead(404, baseHeaders);
      response.end("missing");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requestLog,
    server,
  };
}
