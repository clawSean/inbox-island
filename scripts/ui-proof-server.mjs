import { readFile, readdir } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
]);

async function filesBelow(root, prefix = "") {
  const output = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(root, relative));
    else if (entry.isFile()) output.push(relative);
  }
  return output;
}

export async function startUiProofServer(buildRoot) {
  const manifest = JSON.parse(await readFile(path.join(buildRoot, "manifest.json"), "utf8"));
  const csp = manifest.content_security_policy.extension_pages;
  const allowedPaths = new Set((await filesBelow(buildRoot)).map((file) => `/${file}`));
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const requested = decodeURIComponent(url.pathname === "/" ? "/app/index.html" : url.pathname);
      if (request.method !== "GET" || !allowedPaths.has(requested)) throw new Error("BLOCKED");
      const file = path.resolve(buildRoot, `.${requested}`);
      if (!file.startsWith(`${buildRoot}${path.sep}`)) throw new Error("BLOCKED");
      const body = await readFile(file);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-security-policy": csp,
        "content-type": contentTypes.get(path.extname(file)) || "application/octet-stream",
        "x-content-type-options": "nosniff",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    allowedPaths,
    origin,
    close: () => new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    ))),
  };
}
