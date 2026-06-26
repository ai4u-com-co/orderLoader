export async function register() {
  // Validate required env vars at server startup so the error is immediate
  // and visible in logs before any request is handled.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getConfig } = await import("@/lib/config");
    getConfig();

    // Observabilidad central: nombra el service (por tenant) y, si hay ingest
    // configurado (no siempre en el VM), envía logs a Supabase vía el panel admin.
    const { setServiceName, configureTransport } = await import("@ai4u/platform/logger");
    const tenant = process.env.TENANT ?? "tamaprint";
    setServiceName(`orderloader-${tenant}`);
    const endpoint = process.env.PLATFORM_INGEST_URL;
    const secret = process.env.INGEST_SECRET;
    if (endpoint && secret) {
      configureTransport({ endpoint, secret });
    }
  }
}
