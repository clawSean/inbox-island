import crypto from "node:crypto";

const expectedAccountSha256 = process.env.INBOX_ISLAND_PILOT_ACCOUNT_SHA256;
const hashPattern = /^[a-f0-9]{64}$/u;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

async function visible(locator) {
  return locator.isVisible().catch(() => false);
}

export async function runLiveChromePilot({ context, gmailRequests, page }) {
  if (!hashPattern.test(expectedAccountSha256 || "")) fail("LIVE_PILOT_ACCOUNT_HASH_REQUIRED");
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", () => pageErrors.push(true));
  page.on("console", (entry) => { if (entry.type() === "error") consoleErrors.push(true); });
  process.stderr.write("LIVE_PILOT_WAITING_FOR_HUMAN_GOOGLE_CONSENT\n");

  await page.locator("#gmail-account-check:not([hidden])").waitFor({
    state: "visible",
    timeout: 15 * 60 * 1_000,
  });
  const selected = (await page.locator("#gmail-expected-email").inputValue()).trim().toLowerCase();
  if (sha256(selected) !== expectedAccountSha256) fail("LIVE_PILOT_ACCOUNT_MISMATCH");
  if (gmailRequests.some(({ path }) => path.includes("/messages"))) {
    fail("LIVE_PILOT_READ_BEFORE_CONFIRMATION");
  }

  await page.locator("#run-button").click();
  await page.waitForFunction(() => document.documentElement.dataset.uiState === "loading");
  await page.waitForFunction(() => document.documentElement.dataset.uiState === "ready", null, {
    timeout: 120_000,
  });
  if (await visible(page.locator("#error-banner"))) fail("LIVE_PILOT_SYNC_VISIBLE_ERROR");
  await page.locator('[data-view="all"]').click();
  const threadCount = await page.locator("button.thread-card").count();
  if (threadCount < 1) fail("LIVE_PILOT_NO_THREADS");

  await page.locator("button.thread-card").first().click();
  const linkLocator = page.locator("a.detail-primary-action");
  const link = await linkLocator.getAttribute("href");
  if (!link || new URL(link).origin !== "https://mail.google.com") {
    fail("LIVE_PILOT_THREAD_LINK_INVALID");
  }
  const opened = context.waitForEvent("page", { timeout: 15_000 });
  await linkLocator.click();
  const gmailPage = await opened;
  await gmailPage.waitForLoadState("domcontentloaded").catch(() => {});
  if (!gmailPage.url().startsWith("https://mail.google.com/")) {
    fail("LIVE_PILOT_THREAD_OPEN_INVALID");
  }
  await gmailPage.close();
  await page.bringToFront();

  await page.locator("#disconnect-button").click();
  await page.locator("#connection-label").filter({ hasText: "Gmail not connected" }).waitFor();
  await page.locator("#clear-button").click();
  if (gmailRequests.some(({ method }) => method !== "GET")) fail("LIVE_PILOT_GMAIL_MUTATION");
  if (pageErrors.length || consoleErrors.length) fail("LIVE_PILOT_BROWSER_ERROR");
  return Object.freeze({
    passed: true,
    accountMatched: true,
    confirmationBeforeMessageRead: true,
    threadCount,
    gmailRequestCount: gmailRequests.length,
    gmailMutationCount: 0,
    threadLinkOpened: true,
    disconnected: true,
    localDataCleared: true,
    pageErrors: 0,
    consoleErrors: 0,
  });
}
