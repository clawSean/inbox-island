import { spawnSync } from "node:child_process";
import { rename } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

export const browserConfigs = Object.freeze({
  chrome: Object.freeze({
    allowExisting: true,
    name: "Google Chrome",
    executable: path.join(os.homedir(), "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
  }),
  arc: Object.freeze({ name: "Arc", executable: "/Applications/Arc.app/Contents/MacOS/Arc" }),
  dia: Object.freeze({ name: "Dia", executable: "/Applications/Dia.app/Contents/MacOS/Dia" }),
});

export const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function chromium() {
  const require = createRequire(import.meta.url);
  return require(process.env.PLAYWRIGHT_CORE_PACKAGE || "playwright-core").chromium;
}

export async function waitFor(operation, timeout = 30_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const value = await operation();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await sleep(100);
  }
  throw last || new Error("Timed out");
}

export function assertNotRunning(name) {
  const uid = process.getuid();
  if (!Number.isSafeInteger(uid) || uid < 0) {
    throw new Error("Could not determine the probe user's numeric uid");
  }
  const result = spawnSync("/usr/bin/pgrep", ["-U", String(uid), "-x", name], {
    encoding: "utf8",
  });
  if (result.status === 0) throw new Error(`${name} is already running; refusing to touch a personal session`);
  if (result.status !== 1) throw new Error(`Could not inspect ${name} process state`);
}

export async function moveToTrash(directory) {
  const destination = path.join(os.homedir(), ".Trash", `${path.basename(directory)}-${Date.now()}`);
  await rename(directory, destination);
  return destination;
}
