import { BUCKET_META, VIEW_META } from "./view-model.mjs";
import { SYNTHETIC_ACCOUNT_ID } from "../fixtures/synthetic-mailbox.mjs";

const bucketById = new Map(BUCKET_META.map((item) => [item.id, item]));
const viewById = new Map(VIEW_META.map((item) => [item.id, item]));
function element(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}

function humanize(value) {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function pill(label, type = "bucket-pill") {
  return element("span", type, label);
}

function applyBucketColor(node, bucket) {
  node.dataset.bucket = bucket;
}

export function gmailThreadUrl({ accountId, threadId }) {
  const url = new URL("https://mail.google.com/mail/u/");
  url.searchParams.set("authuser", accountId);
  url.hash = `all/${encodeURIComponent(threadId)}`;
  return url.href;
}

export function renderCounts(root, counts) {
  for (const [view, count] of Object.entries(counts)) {
    const target = root.querySelector(`[data-count="${view}"]`);
    if (target) target.textContent = String(count);
  }
  root.querySelector("#metric-needs").textContent = String(counts["needs-me"] || 0);
  root.querySelector("#metric-review").textContent = String(counts.review || 0);
  root.querySelector("#metric-waiting").textContent = String(counts.waiting || 0);
}

export function renderActiveView(root, view) {
  const meta = viewById.get(view) || viewById.get("all");
  root.querySelector("#active-view-label").textContent = meta.label;
  root.querySelector("#thread-heading").textContent = meta.heading;
  root.querySelector("#search-input").placeholder = `Search ${meta.label.toLowerCase()}`;
  for (const button of root.querySelectorAll("[data-view]")) {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

export function renderThreadList(root, rows, selectedId) {
  const list = root.querySelector("#thread-list");
  const empty = root.querySelector("#empty-state");
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const card = element("button", "thread-card");
    card.type = "button";
    card.dataset.threadId = row.threadId;
    card.setAttribute("aria-pressed", String(row.threadId === selectedId));
    card.classList.toggle("is-selected", row.threadId === selectedId);
    applyBucketColor(card, row.bucket);

    const top = element("span", "thread-topline");
    top.append(element("span", "thread-sender", row.from));
    top.append(element("span", "thread-time", formatTimestamp(row.latestTimestamp)));
    card.append(top, element("strong", "thread-subject", row.subject));
    card.append(element("span", "thread-summary", row.summary));

    const meta = element("span", "thread-meta");
    meta.append(pill(bucketById.get(row.bucket)?.label || humanize(row.bucket)));
    if (row.deadline) meta.append(pill(row.deadline.text, "deadline-pill"));
    card.append(meta);
    fragment.append(card);
  }
  list.replaceChildren(fragment);
  list.setAttribute("aria-busy", "false");
  list.hidden = rows.length === 0;
  empty.hidden = rows.length !== 0;
}

function detailSection(title, text) {
  const section = element("section", "detail-section");
  section.append(element("h3", null, title), element("p", null, text));
  return section;
}

function evidenceList(row) {
  const section = element("section", "detail-section evidence-section");
  section.append(element("h3", null, "Why Inbox Island thinks this"));
  if (!row.evidence.length) {
    section.append(element("p", "detail-muted", "No exact excerpt was needed for this category."));
    return section;
  }
  const list = element("div", "evidence-list");
  for (const item of row.evidence) {
    const quote = element("blockquote", "evidence-quote");
    quote.append(element("p", null, item.quote));
    quote.append(element("footer", null, `${humanize(item.kind)} · untrusted email excerpt`));
    list.append(quote);
  }
  section.append(list);
  return section;
}

export function renderDetail(root, row) {
  const placeholder = root.querySelector("#detail-placeholder");
  const content = root.querySelector("#detail-content");
  const pane = root.querySelector("#detail-pane");
  if (!row) {
    placeholder.hidden = false;
    content.hidden = true;
    content.replaceChildren();
    pane.setAttribute("aria-labelledby", "detail-heading");
    return;
  }

  const tags = element("div", "detail-tags");
  const bucket = pill(bucketById.get(row.bucket)?.label || humanize(row.bucket));
  applyBucketColor(bucket, row.bucket);
  tags.append(bucket);

  const heading = element("h2", "detail-title", row.subject);
  heading.id = "selected-thread-heading";
  heading.tabIndex = -1;
  const sender = element("p", "detail-sender", row.from);
  const actions = element("div", "detail-actions");
  if (row.accountId === SYNTHETIC_ACCOUNT_ID) {
    actions.append(element("span", "detail-muted", "Synthetic example · no Gmail connection"));
  } else {
    const openInGmail = element("a", "detail-primary-action", "Open in Gmail ↗");
    openInGmail.href = gmailThreadUrl(row);
    openInGmail.target = "_blank";
    openInGmail.rel = "noopener noreferrer";
    openInGmail.setAttribute("aria-label", "Open this thread in Gmail in a new tab");
    actions.append(openInGmail);
  }
  const summary = detailSection("Local summary", row.summary);
  const fragment = document.createDocumentFragment();
  fragment.append(tags, heading, sender, actions, summary);
  if (row.requestedAction) fragment.append(detailSection("Suggested next look", row.requestedAction));
  if (row.deadline) fragment.append(detailSection("Deadline candidate", row.deadline.text));
  fragment.append(evidenceList(row));
  const boundary = element("p", "detail-boundary");
  boundary.textContent = "This is a triage suggestion, not a substitute for reviewing Gmail. Inbox Island cannot act on email.";
  fragment.append(boundary);

  content.replaceChildren(fragment);
  placeholder.hidden = true;
  content.hidden = false;
  pane.setAttribute("aria-labelledby", heading.id);
}
