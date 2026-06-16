import { NextResponse } from "next/server";
import { migrate } from "@/lib/db";

/**
 * Migra el schema de la DB (crea tablas/índices y aplica migraciones versionadas).
 *
 * NO siembra clientes: la tabla clientes_aprobados es la única fuente de verdad y se
 * gestiona desde el dashboard /clientes. Un tenant nuevo arranca sin clientes y los va
 * agregando uno por uno, construyendo su prompt con los PDFs reales del tenant.
 */
export async function POST() {
  try {
    migrate();
    return NextResponse.json({ ok: true, message: "DB migrada correctamente" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
