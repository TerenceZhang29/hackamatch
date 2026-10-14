import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EmailMessage, EmailProvider } from "./types";

/** Where the fake provider writes emails: `<repo>/.tmp/outbox`. */
export const OUTBOX_DIR = path.join(process.cwd(), ".tmp", "outbox");

/**
 * Stand-in for Resend (`EMAIL_PROVIDER=fake`): writes each email to
 * `.tmp/outbox` as `<id>.json` (for tests) and `<id>.html` (to open in a
 * browser) instead of sending it.
 */
export const fakeEmailProvider: EmailProvider = {
  async send(message: EmailMessage) {
    const id = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    await mkdir(OUTBOX_DIR, { recursive: true });
    await writeFile(path.join(OUTBOX_DIR, `${id}.json`), JSON.stringify(message, null, 2));
    await writeFile(path.join(OUTBOX_DIR, `${id}.html`), message.html);
    return { id };
  },
};
