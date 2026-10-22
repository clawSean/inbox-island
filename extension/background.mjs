const POPUP_PATH = "app/popup.html";
const FULL_PAGE_PATH = "app/index.html?surface=tab&launcher=repair";

async function openMigrationFallback(error) {
  console.error("Inbox Island could not restore its toolbar launcher", error);
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL(FULL_PAGE_PATH) });
  } catch (fallbackError) {
    console.error("Inbox Island could not open the launcher fallback", fallbackError);
  }
}

async function resetToolbarLauncher() {
  try {
    // 0.3.1 persisted an empty popup and direct-panel ownership. Restore the
    // browser-owned popup first; only then disable the old panel interception.
    await chrome.action.setPopup({ popup: POPUP_PATH });
    const popup = await chrome.action.getPopup({});
    if (popup !== chrome.runtime.getURL(POPUP_PATH)) {
      throw new Error("TOOLBAR_LAUNCHER_MIGRATION_INCOMPLETE");
    }
    if (typeof chrome.sidePanel?.setPanelBehavior === "function"
      && typeof chrome.sidePanel?.getPanelBehavior === "function") {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
      const behavior = await chrome.sidePanel.getPanelBehavior();
      if (behavior.openPanelOnActionClick !== false) {
        throw new Error("TOOLBAR_LAUNCHER_MIGRATION_INCOMPLETE");
      }
    }
    return true;
  } catch (error) {
    // A migration failure must create a visible surface immediately rather
    // than leaving the browser able to consume future toolbar clicks silently.
    await openMigrationFallback(error);
    return false;
  }
}

let resetInFlight;

function ensureToolbarLauncher() {
  if (!resetInFlight) {
    resetInFlight = resetToolbarLauncher().finally(() => {
      resetInFlight = undefined;
    });
  }
  return resetInFlight;
}

chrome.runtime.onInstalled.addListener(ensureToolbarLauncher);
chrome.runtime.onStartup.addListener(ensureToolbarLauncher);

// Unpacked extension reloads do not reliably emit onInstalled or onStartup.
// Repair the persisted 0.3.1 action state whenever the browser evaluates this
// worker, while the listeners above cover later lifecycle activations.
void ensureToolbarLauncher();
