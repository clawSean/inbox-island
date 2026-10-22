# Inbox Island Privacy Policy

Effective: 2026-10-22

Inbox Island is designed so no Inbox Island-operated server receives a Gmail
access token or mailbox content. This policy describes the data the extension
handles, how it is used, and the controls available to users.

## Data Inbox Island handles

When a user explicitly connects Gmail, Inbox Island handles:

- the selected Gmail address;
- sender and recipient addresses, subjects, timestamps, labels, thread/message
  identifiers, and message text in a bounded recent Inbox/Sent slice; and
- a short-lived OAuth access token required to make those Gmail API requests.

Email may contain sensitive personal topics. Inbox Island does not target
financial, health, or other sensitive categories, and it does not download
attachment content.

The disconnected synthetic demo uses fictional `.example.test` data and does
not access Google or Gmail.

## How data is used

Gmail data is used only to provide the user-facing local triage feature:
grouping recent threads into advisory categories and explaining the local
classification. Inbox Island does not use Google user data for advertising,
credit decisions, unrelated profiling, or training or improving a generalized
or foundation AI model.

## Processing, transmission, and sharing

Mail travels directly from Google to the extension over HTTPS and is processed
in the user's browser. Inbox Island has no application server, cloud AI,
telemetry, advertising network, third-party analytics, or remote executable
code in the mailbox path. Gmail data is not sold or shared with third parties,
and the developer cannot read it through Inbox Island.

Google and the user's browser/operating system process data under their own
terms and privacy policies.

## Storage and retention

OAuth access is held only in extension-page memory, for at most 45 minutes, and
is not persisted or refreshed by Inbox Island. Raw message bodies, HTML,
attachments, summaries, and OAuth material are not stored.

Inbox Island stores minimal account-scoped derived triage state locally in the
browser, including account label, Gmail identifiers, timestamps, categories,
flags, and evidence offsets. That local state remains until it is replaced,
the user clears local data, or the extension/browser profile is removed.

## User controls

Users choose and confirm the Google account before Inbox Island lists messages.
They may cancel a sync, disconnect Gmail, or clear all locally stored triage
state in the extension. Disconnecting forgets the in-memory token and clears
local derived state; it does not by itself revoke Google's grant. Google access
can be revoked separately at https://myaccount.google.com/connections.

## Security

Inbox Island uses HTTPS for Google requests, a default-deny extension content
security policy, packaged code only, plain-text rendering for untrusted mail,
bounded message processing, and no Gmail mutation permissions. No security
control eliminates all risk; users should keep their browser and operating
system updated and continue to treat Gmail as authoritative.

## Limited Use

Inbox Island's use of information received from Google APIs adheres to the
Google API Services User Data Policy and the Chrome Web Store User Data Policy,
including the Limited Use requirements.

## Changes and contact

Material changes will be reflected by updating the effective date and public
release notes. Privacy or deletion questions may be filed at
https://github.com/clawSean/inbox-island/issues without including email content,
credentials, OAuth material, or private screenshots. Security reports should
use GitHub's private vulnerability-reporting channel when enabled.
