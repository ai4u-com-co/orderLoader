import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(req: NextRequest) {
  try {
    const { ordenes_compra } = await req.json() as { ordenes_compra: string[] };
    if (!Array.isArray(ordenes_compra) || ordenes_compra.length === 0)
      return NextResponse.json({ ok: false, error: "ordenes_compra requerido" }, { status: 400 });

    const db = getDb();
    const placeholders = ordenes_compra.map(() => "?").join(",");
    db.prepare(`DELETE FROM pedidos_detalle WHERE orden_compra IN (${placeholders})`).run(...ordenes_compra);
    db.prepare(`DELETE FROM pipeline_log WHERE orden_compra IN (${placeholders})`).run(...ordenes_compra);
    const info = db.prepare(`DELETE FROM pedidos_maestro WHERE orden_compra IN (${placeholders})`).run(...ordenes_compra);

    return NextResponse.json({ ok: true, eliminados: info.changes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const estado = searchParams.get("estado");

    const db = getDb();
    const query = estado
      ? "SELECT * FROM pedidos_maestro WHERE estado = ? ORDER BY fecha_recepcion DESC"
      : "SELECT * FROM pedidos_maestro ORDER BY fecha_recepcion DESC";

    const rows = estado ? db.prepare(query).all(estado) : db.prepare(query).all();

    return NextResponse.json({ ok: true, pedidos: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
