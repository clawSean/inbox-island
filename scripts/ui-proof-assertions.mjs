import assert from "node:assert/strict";

function rgb(value) {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/iu)?.[1];
  if (hex) return hex.match(/../gu).map((part) => Number.parseInt(part, 16));
  const channels = value.match(/[\d.]+/gu)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) throw new Error(`UNSUPPORTED_COLOR:${value}`);
  return channels;
}

function luminance(value) {
  const channels = rgb(value).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(left, right) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function assertNamedActions(context, page) {
  const session = await context.newCDPSession(page);
  try {
    await session.send("Accessibility.enable");
    const { nodes } = await session.send("Accessibility.getFullAXTree");
    const roles = new Set(["button", "link", "searchbox", "textbox"]);
    const unnamed = nodes.filter((node) => (
      !node.ignored && roles.has(node.role?.value) && !node.name?.value?.trim()
    ));
    assert.deepEqual(unnamed.map((node) => node.role.value), []);
  } finally {
    await session.detach();
  }
}

export async function assertAppStructure(context, page) {
  await page.waitForFunction(() => document.documentElement.dataset.uiState === "ready");
  assert.equal(await page.locator("main").count(), 1);
  assert.equal(await page.locator("h1").count(), 1);
  const expected = { all: "15", "needs-me": "3", review: "8", waiting: "1", record: "2", noise: "1" };
  for (const [view, count] of Object.entries(expected)) {
    assert.equal(await page.locator(`[data-count="${view}"]`).textContent(), count);
  }
  assert.equal(await page.locator("button").evaluateAll((items) => (
    items.filter((item) => !(item.textContent || item.getAttribute("aria-label") || "").trim()).length
  )), 0);
  assert.equal(await page.locator("[tabindex]").evaluateAll((items) => (
    items.filter((item) => Number(item.getAttribute("tabindex")) > 0).length
  )), 0);
  assert.equal(await page.locator("[id]").evaluateAll((items) => (
    items.length - new Set(items.map((item) => item.id)).size
  )), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator(".triage-workspace").evaluate((element) => (
    element.scrollWidth <= element.clientWidth
  )), true);
  await assertNamedActions(context, page);
}

export async function assertStickyActionVisible(page) {
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.locator("#run-button").focus();
  const visible = await page.locator("#run-button").evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  });
  assert.equal(visible, true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.evaluate(() => document.activeElement?.blur());
}

export async function assertAppContrast(page) {
  await page.locator("#clear-button").focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "run-button");
  const colors = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      focus: getComputedStyle(document.querySelector("#run-button")).outlineColor,
      focusStyle: getComputedStyle(document.querySelector("#run-button")).outlineStyle,
      soft: root.getPropertyValue("--soft"),
      card: root.getPropertyValue("--card"),
      sand: root.getPropertyValue("--sand"),
      nav: root.getPropertyValue("--nav"),
    };
  });
  const checks = {
    secondaryText: ratio(colors.soft, colors.card),
    focusIndicator: ratio(colors.focus, colors.card),
    selectedNavIndicator: ratio(colors.sand, colors.nav),
  };
  assert.notEqual(colors.focusStyle, "none");
  assert.ok(checks.secondaryText >= 4.5);
  assert.ok(checks.focusIndicator >= 3);
  assert.ok(checks.selectedNavIndicator >= 3);
  await page.locator("[data-view=all]").click();
  const rendered = await page.evaluate(() => {
    const ownPair = (selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return [style.color, style.backgroundColor];
    };
    const timestamp = document.querySelector(".thread-card.is-selected .thread-time");
    const search = document.querySelector("#search-input");
    return {
      buckets: [...document.querySelectorAll(".thread-card .bucket-pill")].map((pill) => {
        const style = getComputedStyle(pill);
        return [pill.closest("[data-bucket]").dataset.bucket, style.color, style.backgroundColor];
      }),
      deadline: ownPair(".deadline-pill"),
      timestamp: [
        getComputedStyle(timestamp).color,
        getComputedStyle(timestamp.closest(".thread-card")).backgroundColor,
      ],
      placeholder: [
        getComputedStyle(search, "::placeholder").color,
        getComputedStyle(search.closest(".search-field")).backgroundColor,
      ],
    };
  });
  checks.bucketText = Object.fromEntries(rendered.buckets.map(([bucket, text, background]) => (
    [bucket, ratio(text, background)]
  )));
  checks.deadlineText = ratio(...rendered.deadline);
  checks.selectedTimestamp = ratio(...rendered.timestamp);
  checks.searchPlaceholder = ratio(...rendered.placeholder);
  for (const value of Object.values(checks.bucketText)) assert.ok(value >= 4.5);
  for (const key of ["deadlineText", "selectedTimestamp", "searchPlaceholder"]) {
    assert.ok(checks[key] >= 4.5, `${key} contrast is ${checks[key]}`);
  }
  await page.locator("[data-view=needs-me]").click();
  return checks;
}

export async function assertPopupContrast(context, page) {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Tab");
  const focusedLauncher = await page.evaluate(() => document.activeElement?.id);
  assert.equal(focusedLauncher, "open-tab");
  const colors = await page.evaluate(() => {
    const button = document.activeElement;
    return {
      focus: getComputedStyle(button).outlineColor,
      focusStyle: getComputedStyle(button).outlineStyle,
      subbrand: getComputedStyle(document.querySelector(".popup-header > div > span")).color,
      footer: getComputedStyle(document.querySelector("footer button")).color,
    };
  });
  const checks = {
    focusIndicator: ratio(colors.focus, "#fffefa"),
    subbrandText: ratio(colors.subbrand, "#fffefa"),
    footerText: ratio(colors.footer, "#f7f6f0"),
  };
  assert.notEqual(colors.focusStyle, "none");
  assert.ok(checks.focusIndicator >= 3);
  assert.ok(checks.subbrandText >= 4.5);
  assert.ok(checks.footerText >= 4.5);
  await assertNamedActions(context, page);
  await page.evaluate(() => document.activeElement?.blur());
  return checks;
}
