// Runs once when a Next.js server instance starts. Validating config here makes
// a misconfigured deploy fail at boot rather than on the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getConfig } = await import("@/lib/config");
    getConfig();
  }
}
