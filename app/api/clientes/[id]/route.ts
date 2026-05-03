import { NextRequest, NextResponse } from "next/server";
import { getDb, getClienteById, updateCliente } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const cliente = getClienteById(db, Number(id));
    if (!cliente) return NextResponse.json({ ok: false, error: "Cliente no encontrado" }, { status: 404 });
    return NextResponse.json({
      ok: true,
      cliente: {
        ...cliente,
        nits:     JSON.parse(cliente.nits_json)     as string[],
        keywords: JSON.parse(cliente.keywords_json) as string[],
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json() as {
      nombre?: string; nit_principal?: string; nits?: string[];
      keywords?: string[]; card_code?: string; prompt?: string; activo?: number;
    };

    const db = getDb();
    const existing = getClienteById(db, Number(id));
    if (!existing) return NextResponse.json({ ok: false, error: "Cliente no encontrado" }, { status: 404 });

    updateCliente(db, Number(id), {
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
