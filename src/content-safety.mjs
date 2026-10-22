import { LIMITS } from "./contracts.mjs";

function cleanControls(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu, "")
    .replace(/\r\n?/gu, "\n");
}

function decodeEntities(value) {
  const named = new Map([
    ["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", "\""],
    ["apos", "'"], ["nbsp", " "],
  ]);
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/giu, (match, entity) => {
    if (entity.startsWith("#")) {
      const hex = entity[1]?.toLowerCase() === "x";
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isSafeInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : "�";
    }
    return named.get(entity.toLowerCase()) ?? match;
  });
}

export function normalizeWhitespace(value) {
  return cleanControls(value)
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function sanitizeHtml(value) {
  const html = cleanControls(value);
  const withoutQuotedHistory = html
    .replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote\s*>/giu, " ")
    .replace(/<div\b[^>]*class\s*=\s*["'][^"']*\bgmail_quote\b[^"']*["'][^>]*>[\s\S]*?<\/div\s*>/giu, " ");
  const links = [...withoutQuotedHistory.matchAll(
    /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giu,
  )].slice(0, 24).map((match) => cleanControls(decodeEntities(
    match[1] ?? match[2] ?? match[3] ?? "",
  )).trim().slice(0, 2_000)).filter((link) => /^(?:https?|wss?):\/\//iu.test(link));
  const hidden = /(?:\shidden(?:\s|=|>)|aria-hidden\s*=\s*["']?true|mso-hide\s*:\s*all|display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$)|font-size\s*:\s*0|(?:max-)?(?:height|width)\s*:\s*0|clip(?:-path)?\s*:\s*(?:rect\s*\(\s*0|inset\s*\(\s*100%))/iu.test(withoutQuotedHistory);
  const withoutActive = withoutQuotedHistory
    .replace(/<!--([\s\S]*?)-->/gu, " ")
    .replace(/<(script|style|noscript|iframe|object|embed|form|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ");
  const visible = normalizeWhitespace(decodeEntities(withoutActive));
  const linkText = links.map((link) => `Link target: ${link}`).join("\n");
  const visibleBudget = Math.max(0, LIMITS.maxBodyChars - linkText.length - 1);
  return {
    hidden,
    links: Object.freeze(links),
    text: normalizeWhitespace(`${visible.slice(0, visibleBudget)}\n${linkText}`),
  };
}

export function stripQuotedReply(value) {
  const kept = [];
  let quoted = false;
  let afterOnMarker = false;
  let sawQuotedLine = false;
  for (const line of normalizeWhitespace(value).split("\n")) {
    if (/^-{2,}\s*Original Message\s*-{2,}$/iu.test(line)) {
      quoted = true;
      break;
    }
    if (/^On .{1,180} wrote:\s*$/iu.test(line)) {
      quoted = true;
      afterOnMarker = true;
      continue;
    }
    if (/^\s*>/u.test(line)) {
      quoted = true;
      sawQuotedLine = true;
      continue;
    }
    if (afterOnMarker) {
      if (!sawQuotedLine) continue;
      afterOnMarker = false;
      if (line === "") continue;
    }
    kept.push(line);
  }
  return { body: normalizeWhitespace(kept.join("\n")), quotedOmitted: quoted };
}

function securitySignals(value) {
  const signals = new Set();
  const patterns = [
    ["request", /\b(?:please|can you|could you|would you|will you|need you to|let me know|confirm|approve|review|reply|respond|send|share|sign)\b|\?/iu],
    ["urgency", /\b(?:urgent|action required|past due|overdue|immediately|time[- ]sensitive)\b/iu],
    ["deadline", /\b(?:due|deadline|by|before|tomorrow|monday|tuesday|wednesday|thursday|friday)\b/iu],
    ["credential", /\b(?:password|passcode|verification code|2fa|seed phrase|private key|login)\b/iu],
    ["injection", /\b(?:ignore|disregard|override)\b.{0,48}\b(?:instructions?|prompt|policy)\b/iu],
  ];
  for (const [name, pattern] of patterns) if (pattern.test(value)) signals.add(name);
  return signals;
}

export function alternativesMismatch(plain, html) {
  if (!plain || !html) return false;
  const left = securitySignals(plain);
  const right = securitySignals(html);
  return [...new Set([...left, ...right])].some((signal) => left.has(signal) !== right.has(signal));
}
