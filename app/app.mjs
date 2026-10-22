import { syntheticMailbox } from "../fixtures/synthetic-mailbox.mjs";
import { normalizeMailbox } from "../src/gmail-normalize.mjs";
import {
  clearAllSnapshots,
  observeDemoClears,
  observeGmailDisconnects,
  runDemoTriage,
} from "./runtime.mjs";
import { createGmailPilot, isGmailPilotRuntime } from "./gmail-pilot.mjs";
import { createGmailUi } from "./gmail-ui.mjs";
import { bindInteractions } from "./interactions.mjs";
import { renderActiveView, renderCounts, renderDetail, renderThreadList } from "./render.mjs";
import { buildUiRows, deriveViewCounts, filterUiRows } from "./view-model.mjs";

const root = document;
const narrowLayout = matchMedia("(max-width: 840px)");
const gmailPilot = isGmailPilotRuntime() ? createGmailPilot() : null;
const modalBackground = [
  ".skip-link",
  ".nav-rail",
  ".topbar",
  ".hero",
  ".metric-grid",
  ".thread-pane",
];
const state = {
  rows: Object.freeze([]),
  view: "needs-me",
  search: "",
  selectedId: null,
  running: false,
  lastTriggerId: null,
  runVersion: 0,
  accountLabel: null,
  pendingAccount: undefined,
  abortController: null,
  cancelReason: null,
  savedCounts: null,
};

function setLive(message) {
  root.querySelector("#live-status").textContent = message;
}

function setError(message = "") {
  const banner = root.querySelector("#error-banner");
  banner.textContent = message;
  banner.hidden = !message;
}

function filteredRows() {
  return filterUiRows(state.rows, { view: state.view, search: state.search });
}

function setDetailOpen(open) {
  const modal = Boolean(open && narrowLayout.matches);
  document.body.classList.toggle("detail-open", modal);
  for (const selector of modalBackground) root.querySelector(selector).inert = modal;
  const pane = root.querySelector("#detail-pane");
  if (modal) {
    pane.setAttribute("role", "dialog");
    pane.setAttribute("aria-modal", "true");
  } else {
    pane.removeAttribute("role");
    pane.removeAttribute("aria-modal");
  }
}

function paint({ focusDetail = false } = {}) {
  const visible = filteredRows();
  if (state.selectedId && !visible.some(({ threadId }) => threadId === state.selectedId)) {
    state.selectedId = visible[0]?.threadId || null;
  }
  renderCounts(root, state.savedCounts ?? deriveViewCounts(state.rows));
  renderActiveView(root, state.view);
  renderThreadList(root, visible, state.selectedId);
  const selected = state.rows.find(({ threadId }) => threadId === state.selectedId) || null;
  renderDetail(root, selected);
  setDetailOpen(Boolean(selected) && focusDetail);
  if (focusDetail && selected) root.querySelector("#selected-thread-heading")?.focus();
}

function setRunning(running) {
  state.running = running;
  const button = root.querySelector("#run-button");
  button.disabled = running && !gmailPilot;
  root.querySelector("#clear-button").disabled = running;
  root.querySelector("#demo-button").disabled = running;
  root.querySelector("#disconnect-button").disabled = running;
  const idle = gmailPilot
    ? (state.pendingAccount !== undefined ? "Sync selected account"
      : "Choose Google account")
    : "Run demo";
  button.querySelector("span:last-child").textContent = running
    ? (gmailPilot ? "Cancel sync" : "Sorting…") : idle;
  root.querySelector("#thread-list").setAttribute("aria-busy", String(running));
  document.documentElement.dataset.uiState = running ? "loading" : "ready";
}

function showCleared(message) {
  state.cancelReason = "cleared";
  state.abortController?.abort();
  state.runVersion += 1;
  state.rows = Object.freeze([]);
  state.savedCounts = null;
  state.selectedId = null;
  state.pendingAccount = undefined;
  root.querySelector("#gmail-account-check").hidden = true;
  root.querySelector("#empty-state h3").textContent = "Nothing here";
  root.querySelector("#empty-state p").textContent = "Try another view or clear your search.";
  root.querySelector("#hero-title").textContent = gmailPilot
    ? "Local triage cleared." : "Local demo cleared.";
  root.querySelector("#hero-copy").textContent = gmailPilot
    ? "Local triage is gone. Google permission, if previously granted, is unchanged."
    : "Run the synthetic mailbox again whenever you want.";
  if (gmailPilot) {
    root.querySelector("#connection-label").textContent = state.accountLabel
      ? `${state.accountLabel} · local data cleared` : "Gmail not connected";
  }
  paint();
  setLive(message);
}

function showResults(mailbox, output, persisted, source) {
  state.rows = buildUiRows(output, normalizeMailbox(mailbox.messages));
  state.savedCounts = null;
  root.querySelector("#empty-state h3").textContent = "Nothing here";
  root.querySelector("#empty-state p").textContent = "Try another view or clear your search.";
  const initial = filteredRows();
  state.selectedId = narrowLayout.matches ? null : initial[0]?.threadId || null;
  const counts = deriveViewCounts(state.rows);
  root.querySelector("#hero-title").textContent = `${counts["needs-me"]} threads likely need you.`;
  if (source === "gmail") {
    root.querySelector("#surface-badge").textContent = "Private Gmail pilot";
    state.accountLabel = mailbox.profile.emailAddress;
    root.querySelector("#connection-label").textContent = mailbox.profile.emailAddress;
    root.querySelector("#hero-copy").textContent = persisted
      ? `${mailbox.messages.length} recent messages processed locally. Raw Gmail content was not saved.`
      : "Processed locally. A newer surface already owns the saved snapshot.";
  } else {
    root.querySelector("#surface-badge").textContent = "Synthetic demo";
    root.querySelector("#connection-label").textContent = "Demo · Gmail not connected";
    root.querySelector("#hero-copy").textContent = persisted
      ? "Sorted locally from a hostile synthetic mailbox. Nothing left this browser."
      : "Sorted locally. A newer surface already owns the saved snapshot.";
  }
  paint();
}

async function runDemo() {
  if (state.running) return;
  const runVersion = ++state.runVersion;
  setError();
  setRunning(true);
  setLive("Running local synthetic triage.");
  try {
    const { output, persisted } = await runDemoTriage();
    if (runVersion !== state.runVersion) return;
    showResults(syntheticMailbox, output, persisted, "demo");
    setLive(`Triage complete. ${state.rows.length} synthetic threads sorted locally.`);
  } catch (error) {
    state.rows = Object.freeze([]);
    paint();
    setError(`Local demo failed safely: ${error.message}`);
    setLive("Local demo failed safely.");
  } finally {
    setRunning(false);
  }
}

async function runPublicDemo() {
  if (state.running) return;
  gmailUi?.cancelPreparation();
  root.querySelector("#gmail-disclosure").hidden = true;
  await runDemo();
}

async function clearLocal() {
  if (state.running) return;
  gmailUi?.cancelPreparation();
  setError();
  try {
    await clearAllSnapshots();
    // A new account lookup may have started while IndexedDB was clearing.
    gmailUi?.cancelPreparation();
    showCleared(gmailPilot
      ? "Saved local triage data cleared. Google access is unchanged."
      : "Saved synthetic triage data cleared.");
  } catch (error) {
    setError(`Clear failed safely: ${error.message}`);
  }
}

const gmailUi = gmailPilot ? createGmailUi({
  gmailPilot,
  paint,
  root,
  setError,
  setLive,
  setRunning,
  showCleared,
  showResults,
  state,
}) : null;

const surface = new URLSearchParams(location.search).get("surface") === "tab" ? "tab" : "panel";
document.documentElement.dataset.surface = surface;
observeDemoClears(() => {
  gmailUi?.cancelPreparation();
  showCleared("Saved local data cleared in another Inbox Island surface.");
});
observeGmailDisconnects(() => gmailUi?.disconnectedElsewhere());
narrowLayout.addEventListener("change", ({ matches }) => {
  setDetailOpen(false);
  state.selectedId = matches ? null : filteredRows()[0]?.threadId || null;
  paint();
});
bindInteractions({
  clear: clearLocal,
  disconnect: gmailUi?.disconnect ?? (() => {}),
  filteredRows,
  narrowLayout,
  paint,
  root,
  run: gmailPilot ? () => {
    root.querySelector("#gmail-disclosure").hidden = false;
    return gmailUi.run();
  } : runDemo,
  setDetailOpen,
  setError,
  setLive,
  state,
});
paint();
if (gmailPilot) {
  root.querySelector("#surface-badge").textContent = "Private Gmail pilot";
  root.querySelector("#connection-label").textContent = "Gmail not connected";
  root.querySelector("#privacy-title").textContent = "Local processing";
  root.querySelector("#privacy-copy").textContent =
    "Gmail content goes directly from Google to this browser. No telemetry or app server.";
  root.querySelector("#clear-button").textContent = "Clear local data";
  root.querySelector("#demo-button").hidden = false;
  root.querySelector("#disconnect-button").hidden = false;
  root.querySelector("#hero-title").textContent = "Connect your Gmail.";
  root.querySelector("#hero-copy").textContent =
    "Choose any Google account in this browser, approve read-only access, then confirm before Inbox Island reads recent messages.";
  root.querySelector("#gmail-disclosure").hidden = false;
  setRunning(false);
  gmailUi.restore();
} else {
  runDemo();
}

root.querySelector("#demo-button").addEventListener("click", () => void runPublicDemo());
