import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Downloads an event's web page for "Fill from event site" (P1-25) and turns
 * it into plain text for the model. The admin gives the URL, so the server
 * must not be steerable at itself or the private network (SSRF): https only,
 * every address the host resolves to must be public, checked again after
 * each redirect, with a time and size limit.
 *
 * The address is checked, then fetched, so a host that changes its DNS answer
 * in between could slip past (rebinding). Acceptable here: only admins can
 * start a fetch, and the response is only read as text.
 */

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
/** About 50,000 tokens of text: enough for an event page, and caps the cost of one fill. */
export const MAX_TEXT_CHARS = 200_000;

export class EventPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventPageError";
  }
}

/** Whether an IP address is loopback, private, link-local or otherwise not on the public internet. */
export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped) return isPrivateAddress(mapped);
  if (isIP(address) === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      /^fe[89ab]/.test(lower) ||
      lower.startsWith("ff")
    );
  }
  return true;
}

type Resolve = (host: string) => Promise<string[]>;

const resolveAll: Resolve = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

/** Throws unless `url` is https on a host whose every address is public. */
export async function checkPublicUrl(url: URL, resolve: Resolve = resolveAll): Promise<void> {
  if (url.protocol !== "https:") throw new EventPageError("Use an https link");
  if (url.username || url.password) throw new EventPageError("Links with a login aren't allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : await resolve(host);
  } catch {
    throw new EventPageError("That site couldn't be found");
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new EventPageError("That address isn't on the public internet");
  }
}

/** Reads at most MAX_BYTES of the body. */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new EventPageError("That page is too large");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Downloads the page at `rawUrl` (following up to 3 checked redirects) and returns its text. */
export async function fetchEventPageText(
  rawUrl: string,
  deps: { fetch?: typeof fetch; resolve?: Resolve } = {},
): Promise<{ url: string; text: string }> {
  const doFetch = deps.fetch ?? fetch;
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new EventPageError("That isn't a link");
  }
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; ; hop++) {
    await checkPublicUrl(url, deps.resolve);
    let response: Response;
    try {
      response = await doFetch(url, {
        redirect: "manual",
        signal,
        headers: { accept: "text/html, text/plain;q=0.9", "user-agent": "HackaMatch event import" },
      });
    } catch {
      throw new EventPageError(
        signal.aborted ? "The site took too long" : "The site couldn't be reached",
      );
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop >= MAX_REDIRECTS) throw new EventPageError("Too many redirects");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new EventPageError(`The site answered ${response.status}`);
    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/.test(type)) {
      throw new EventPageError("That link isn't a web page");
    }
    const body = await readCapped(response);
    const text = type.includes("text/plain") ? body : htmlToText(body);
    return { url: url.toString(), text: text.slice(0, MAX_TEXT_CHARS) };
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  hellip: "…",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/**
 * The readable text of a page: the title, meta descriptions and JSON-LD event
 * data first (many event sites include it), then the visible text, with
 * scripts, styles and markup dropped and block elements on their own lines.
 */
export function htmlToText(html: string): string {
  const parts: string[] = [];
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  if (title) parts.push(`Title: ${decodeEntities(title).trim()}`);
  for (const match of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = match[0];
    const name = /(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (content && (name === "description" || name === "og:description")) {
      parts.push(`Description: ${decodeEntities(content).trim()}`);
    }
  }
  for (const match of html.matchAll(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    parts.push(`Structured data: ${match[1]!.trim()}`);
  }
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(
      /<\/?(p|div|section|article|header|footer|main|aside|li|ul|ol|h[1-6]|tr|table|dt|dd)\b[^>]*>/gi,
      "\n",
    )
    .replace(/<[^>]+>/g, " ");
  parts.push(
    decodeEntities(body)
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n"),
  );
  return parts.filter(Boolean).join("\n\n");
}
