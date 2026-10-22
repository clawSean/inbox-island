import assert from "node:assert/strict";

async function openPopup(context, origin, watch) {
  const page = await context.newPage();
  watch(page);
  await page.goto(`${origin}/app/popup.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.popupState === "ready");
  return page;
}

export async function provePopupLaunchers(context, origin, watch) {
  const tabLauncher = await openPopup(context, origin, watch);
  assert.equal(await tabLauncher.locator("#open-compact").count(), 0);
  assert.equal((await tabLauncher.locator("#open-tab").textContent()).trim(), "✦ Open full triage");
  const newPage = context.waitForEvent("page");
  await tabLauncher.locator("#open-tab").click();
  const tab = await newPage;
  watch(tab);
  await tab.waitForFunction(() => document.documentElement.dataset.uiState === "ready");
  assert.equal(new URL(tab.url()).searchParams.get("surface"), "tab");
  assert.equal(await tab.evaluate(() => document.documentElement.dataset.surface), "tab");
  await tab.close();
  if (!tabLauncher.isClosed()) await tabLauncher.close();
}
