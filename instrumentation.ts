export async function register() {
  // Validate required env vars at server startup so the error is immediate
  // and visible in logs before any request is handled.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getConfig } = await import("@/lib/config");
    getConfig();
  }
}
