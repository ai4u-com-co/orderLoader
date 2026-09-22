import { getDb, logPipeline } from "@/lib/db";
import { reconciliarIngresadosYAlertar } from "@/lib/reconcile-ingresados";

/**
 * Reconciliación diaria de Ingresados vs SAP — ver lib/reconcile-ingresados.ts.
 * Disparada por un cron independiente del pipeline horario (una vez al día).
 */
export async function POST() {
  try {
    const huerfanos = await reconciliarIngresadosYAlertar();
    try {
      logPipeline(
        getDb(),
        null,
        0,
        "reconcile-ingresados",
        "OK",
        `${huerfanos.length} huérfano(s) detectados`
      );
    } catch { /* ignore */ }

    return Response.json({ ok: true, huerfanos: huerfanos.length });
  } catch (e) {
    const msg = String(e);
    try {
      logPipeline(getDb(), null, 0, "reconcile-ingresados", "ERROR", msg.slice(0, 300));
    } catch { /* ignore */ }

    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
