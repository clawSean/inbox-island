import { createGmailPilot, isGmailPilotRuntime } from "./gmail-pilot.mjs";
import {
  announceGmailDisconnect,
  clearAllSnapshots,
  loadDemoSnapshot,
  loadLatestGmailSnapshot,
  observeGmailDisconnects,
  openFullTab,
} from "./runtime.mjs";

const title = document.querySelector("#popup-title");
const copy = document.querySelector("#popup-copy");
const stats = document.querySelector("#mini-stats");
const status = document.querySelector("#popup-status");
const gmailPilot = isGmailPilotRuntime();
const pilot = gmailPilot ? createGmailPilot() : null;

function summarize(results) {
  return {
    total: results.length,
    needs: results.filter(({ bucket }) => bucket === "reply" || bucket === "attention").length,
    waiting: results.filter(({ bucket }) => bucket === "waiting").length,
    records: results.filter(({ bucket }) => bucket === "record").length,
    lowSignal: results.filter(({ bucket }) => bucket === "noise").length,
  };
}

function showCounts(counts) {
  document.querySelector("#saved-needs").textContent = String(counts.needs);
  document.querySelector("#saved-waiting").textContent = String(counts.waiting);
  document.querySelector("#saved-records").textContent = String(counts.records);
  document.querySelector("#saved-low-signal").textContent = String(counts.lowSignal);
  stats.hidden = false;
}

async function refresh() {
  try {
    if (gmailPilot) {
      document.querySelector(".summary-kicker").textContent = "Private Gmail pilot";
      document.querySelector("#boundary-title").textContent = "Read-only Gmail pilot";
      document.querySelector("#boundary-copy").textContent =
        "Mail goes directly from Google to this browser. No telemetry or app server.";
      document.querySelector("#clear-saved").textContent = "Clear local data";
      document.querySelector("#disconnect-gmail").hidden = false;
      const snapshot = await loadLatestGmailSnapshot();
      if (snapshot) {
        const counts = summarize(snapshot.results);
        title.textContent = `${counts.needs} saved threads likely need you.`;
        copy.textContent = "Saved local categories are ready. Open triage and sync to rebuild message cards.";
        showCounts(counts);
      } else {
        title.textContent = "Ready to sort your inbox?";
        copy.textContent = "Open triage to connect Gmail or sync a bounded recent slice locally.";
        stats.hidden = true;
      }
      return;
    }
    const snapshot = await loadDemoSnapshot();
    if (!snapshot) {
      title.textContent = "Ready to clear the noise?";
      copy.textContent = "Open the cockpit to sort a synthetic mailbox entirely on this device.";
      stats.hidden = true;
      return;
    }
    const counts = summarize(snapshot.results);
    title.textContent = counts.needs ? `${counts.needs} threads likely need you.` : "Your demo is sorted.";
    copy.textContent = "Saved categories are ready. Open the cockpit to rebuild ephemeral summaries.";
    showCounts(counts);
  } catch {
    title.textContent = "Saved demo needs a reset.";
    copy.textContent = "The local snapshot failed closed. Clear it, then run the synthetic demo again.";
    stats.hidden = true;
  } finally {
    document.documentElement.dataset.popupState = "ready";
  }
}

document.querySelector("#open-tab").addEventListener("click", async () => {
  status.textContent = "Opening…";
  try {
    await openFullTab();
    globalThis.close();
  } catch {
    status.textContent = "Could not open page";
  }
});

document.querySelector("#clear-saved").addEventListener("click", async () => {
  status.textContent = "Clearing…";
  try {
    await clearAllSnapshots();
    status.textContent = gmailPilot ? "Local data cleared" : "Demo cleared";
    await refresh();
  } catch {
    status.textContent = "Clear failed safely";
  }
});

document.querySelector("#disconnect-gmail").addEventListener("click", async () => {
  if (!pilot) return;
  status.textContent = "Disconnecting…";
  try {
    await pilot.disconnect();
    await clearAllSnapshots();
    announceGmailDisconnect();
    status.textContent = "Disconnected; Google permission may remain";
    await refresh();
  } catch {
    status.textContent = "Disconnect failed safely";
  }
});

observeGmailDisconnects(() => {
  pilot?.forgetMemoryToken();
  status.textContent = "Gmail disconnected in another view";
  refresh();
});

refresh();
