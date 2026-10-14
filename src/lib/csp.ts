/**
 * The Content-Security-Policy for app pages (P1-18). Scripts must carry the
 * per-request nonce (Next.js adds it to its own scripts when the request has a
 * CSP header); 'strict-dynamic' lets those scripts load the app's chunks.
 */
export function contentSecurityPolicy(options: {
  nonce: string;
  supabaseUrl: string;
  dev: boolean;
  https: boolean;
}): string {
  const directives = [
    "default-src 'self'",
    // React's development build needs eval for its debugging tools.
    `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic'${options.dev ? " 'unsafe-eval'" : ""}`,
    // Next.js and React set some inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${options.supabaseUrl}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (options.https) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
