const POPUP_PATH = "app/popup.html";
const FULL_PAGE_PATH = "app/index.html?surface=tab&launcher=repair";

async function openLauncherFallback(error) {
  console.error("Inbox Island could not verify its toolbar launcher", error);
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL(FULL_PAGE_PATH) });
  } catch (fallbackError) {
    console.error("Inbox Island could not open the launcher fallback", fallbackError);
  }
}

async function verifyToolbarLauncher() {
  try {
    await chrome.action.setPopup({ popup: POPUP_PATH });
    const popup = await chrome.action.getPopup({});
    if (popup !== chrome.runtime.getURL(POPUP_PATH)) {
      throw new Error("TOOLBAR_LAUNCHER_MIGRATION_INCOMPLETE");
    }
    return true;
  } catch (error) {
    await openLauncherFallback(error);
    return false;
  }
}

let resetInFlight;

function ensureToolbarLauncher() {
  if (!resetInFlight) {
    resetInFlight = verifyToolbarLauncher().finally(() => {
      resetInFlight = undefined;
    });
  }
  return resetInFlight;
}

chrome.runtime.onInstalled.addListener(ensureToolbarLauncher);
chrome.runtime.onStartup.addListener(ensureToolbarLauncher);

// Unpacked extension reloads do not reliably emit onInstalled or onStartup.
// Verify the browser-owned popup whenever the worker is evaluated too.
void ensureToolbarLauncher();
