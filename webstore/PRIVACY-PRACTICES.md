# Privacy practices form copy

## Single purpose

> Prioritize a user-initiated, bounded slice of recent Gmail locally so the
> user can see which threads likely need a reply or attention, without changing
> the mailbox.

## Permission justifications

### `identity`

> Opens the browser-owned Google authorization flow and receives the selected
> account's short-lived OAuth result after an explicit user click. Inbox Island
> keeps the resulting access token only in memory, for at most 45 minutes, and
> does not persist or refresh it.

### `https://gmail.googleapis.com/*`

> Calls only the Gmail API over HTTPS to read the selected account profile and
> a bounded recent Inbox/Sent slice for the extension's local triage feature.
> The extension has no Gmail mutation code or permission and cannot send,
> reply, label, archive, delete, or mark mail read.

No `sidePanel`, `tabs`, content-script, browsing-history, cookies, storage,
optional, or broad-host permission is declared.

## Remote code

Select:

> **No, I am not using remote code.**

All executable JavaScript and CSS ships in the package. The only remote calls
are Google OAuth and Gmail API data requests; no response is executed as code.

## User data handling

Do not claim that the product handles no user data. Chrome's policy explicitly
requires disclosure even for local-only processing.

Disclose at least:

- **Personally identifiable information:** selected Gmail address plus message
  sender/recipient addresses.
- **Authentication information:** the short-lived OAuth access token held in
  memory.
- **Personal communications:** Gmail subjects, timestamps, labels, and message
  text in the bounded slice.

Mailbox communications may incidentally contain financial, health, or other
sensitive topics. If the live dashboard offers separate checkboxes whose help
text includes incidental message content, select every applicable category
rather than under-disclosing. Inbox Island does not target those categories,
download attachments, or persist raw communication content.

## Data-use certifications

Certify only while the shipped code and public policy retain all of these:

- Data is used only for the disclosed local triage feature.
- Data is not sold or used for advertising, creditworthiness, or unrelated
  profiling.
- Data is not transferred to third parties or an Inbox Island server.
- Humans cannot read user mail through Inbox Island.
- Google user data is not used to train or improve a generalized/foundation
  model.
- The extension complies with the Chrome Web Store User Data Policy, including
  Limited Use.

## Prominent in-product disclosure

This exact disclosure is shown beside the Connect action before authorization:

> Choosing a Google account means you agree to let Inbox Island read addresses,
> subjects, and message text from a bounded recent Inbox/Sent slice for
> on-device triage. It does not send that data to an Inbox Island server or
> cloud AI.

The user's **Choose Google account** click is the affirmative action following
that disclosure. The disconnected demo does not invoke OAuth or Gmail.
