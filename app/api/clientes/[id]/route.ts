import { NextRequest, NextResponse } from "next/server";
import { getDb, getClienteById, updateCliente } from "@/lib/db";

/** Valida el id de ruta; un valor no numérico no debe llegar como NaN al binding SQLite. */
function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const safeParseArray = (json: string): string[] => {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; }
  catch { return []; }
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numId = parseId(id);
    if (numId === null) return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    const db = getDb();
    const cliente = getClienteById(db, numId);
    if (!cliente) return NextResponse.json({ ok: false, error: "Cliente no encontrado" }, { status: 404 });
    return NextResponse.json({
      ok: true,
      cliente: {
        ...cliente,
        nits:     safeParseArray(cliente.nits_json),
        keywords: safeParseArray(cliente.keywords_json),
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numId = parseId(id);
    if (numId === null) return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    const body = await req.json() as {
      nombre?: string; nit_principal?: string; nits?: string[];
      keywords?: string[]; card_code?: string; prompt?: string; activo?: number;
    };

    const db = getDb();
    const existing = getClienteById(db, numId);
    if (!existing) return NextResponse.json({ ok: false, error: "Cliente no encontrado" }, { status: 404 });

    updateCliente(db, numId, {
      nombre:        body.nombre?.trim().toUpperCase(),
      nit_principal: body.nit_principal?.trim(),
      nits_json:     body.nits !== undefined     ? JSON.stringify(body.nits)     : undefined,
      keywords_json: body.keywords !== undefined ? JSON.stringify(body.keywords) : undefined,
      card_code:     body.card_code?.trim(),
      prompt:        body.prompt,
      activo:        body.activo,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
