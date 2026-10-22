# VISION — Inbox Island

## Purpose

Build a useful inbox-triage product that reads Gmail with the user's explicit
read-only authorization and performs all email interpretation on the user's
device. It should surface likely replies, attention items, deadlines, waiting
threads, records, and low-signal mail without sending email or derived client
data to an AI provider or application backend. It augments ordinary inbox
review; it does not replace the mailbox or promise complete detection.

The first intended users are Madison and her coworkers, JPop, and other
privacy-constrained professionals who want useful inbox triage without sending
mailbox content to a cloud AI provider. Their work may involve confidential
client, medical, financial, legal, HR, or company information.

Madison and her coworkers are design partners for the legal-professional use
case, not an excuse to bypass firm policy. The product should make security and
privacy review easier with a narrow read-only scope, inspectable local data
flows, and reproducible evidence. Each firm still decides whether the product,
browser extension, OAuth access, and local AI are approved for its people and
matters.

## Product Promises

- Gmail content flows directly between Google and the user's browser.
- Models process email locally. The product backend never receives email,
  summaries, embeddings, prompts, contacts, attachment contents, or OAuth
  tokens.
- Authorization is limited to `gmail.readonly`; the product cannot send,
  modify, label, archive, delete, or mark mail read.
- Every email, header, link, and attachment is untrusted input. Model output is
  data, never authority.
- No telemetry contains mailbox-derived values. Useful operation must remain
  possible with telemetry completely disabled.
- Users can inspect the data flow, clear local data, disconnect Gmail, and
  understand the limits without trusting a vague "private AI" claim.
- Triage views are advisory and never mutate or hide Gmail messages. Uncertain
  mail remains visible, and ordinary inbox review plus the user's judgment stay
  authoritative.

## Non-Goals

- No email composition, sending, forwarding, labeling, archiving, deletion, or
  link following in the first product.
- No server-side mailbox sync, inference, logging, analytics, backup, or token
  storage.
- No DOM scraping as the primary ingestion path.
- No promise that local processing makes the product universally compliant or
  permitted by an employer, firm, regulator, engagement, or client agreement.
- No claim that a model can perfectly detect urgency, phishing, prompt
  injection, deadlines, privilege, or sensitive information.
- No attachment interpretation until each parser and format has its own
  containment, resource, and adversarial proof.

## Done Criteria

- A backendless browser proof authenticates with `gmail.readonly`, synchronizes
  a bounded mailbox window through the Gmail API, and triages it locally.
- Network proof shows zero mailbox-derived traffic to any destination other
  than Google's Gmail API; model assets are immutable and integrity-checked.
- The local inference boundary has no network, browser identity, Gmail, DOM,
  navigation, clipboard, or extension-action authority.
- Raw bodies are not durably stored by default; derived local state is minimal,
  documented, erasable, account-scoped, and never placed in sync storage.
- Hostile-email, malformed MIME, oversized input, model failure, OAuth failure,
  storage corruption, update, and exfiltration canaries fail safely.
- The user can see `Needs reply`, `Needs attention`, `Waiting`, `Record`, and
  `Noise` views with evidence-linked reasons and direct Gmail navigation.
- A public launch packet includes Google OAuth verification evidence, Chrome
  Web Store disclosures, privacy policy, data-flow diagram, threat model, SBOM,
  model/license inventory, security test receipts, deletion instructions, and
  an honest organizational-approval boundary.

## Decision Principles

- Eliminate data paths before promising not to use them.
- Capability isolation beats asking a model to resist hostile prose.
- Read-only and no-server are product invariants, not launch toggles.
- Prefer deterministic rules and evidence-linked structured output around a
  small local model; never turn prose into executable intent.
- Optimize measured prioritization and review effort without turning misses into
  a perfect-detection or safety guarantee.
- Minimize permissions, persistence, dependencies, and remotely supplied code.
- Synthetic-data proof precedes real mailbox access.
- Compliance claims require named requirements and evidence; "local" alone is
  not a compliance framework.
