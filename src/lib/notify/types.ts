export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export interface EmailProvider {
  /** Sends one email and returns the provider's message id. Throws on failure. */
  send(message: EmailMessage): Promise<{ id: string }>;
}
