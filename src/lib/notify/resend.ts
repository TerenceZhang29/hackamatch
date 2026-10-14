import type { EmailMessage, EmailProvider } from "./types";

/** Resend over its REST API (no SDK needed for one endpoint). */
export function createResendProvider(options: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}): EmailProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async send(message: EmailMessage) {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: message.headers,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Resend failed: ${response.status} ${await response.text()}`);
      }
      const body = (await response.json()) as { id?: string };
      if (!body.id) throw new Error("Resend returned no message id");
      return { id: body.id };
    },
  };
}
