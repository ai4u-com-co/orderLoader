import { NextRequest, NextResponse } from "next/server";
import { getDb, getClientes, upsertCliente } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    const clientes = getClientes(db).map(c => ({
      ...c,
      nits:     JSON.parse(c.nits_json)     as string[],
      keywords: JSON.parse(c.keywords_json) as string[],
    }));
    return NextResponse.json({ ok: true, clientes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      carpeta: string; nombre: string; nit_principal: string;
      nits: string[]; keywords: string[]; card_code: string; prompt: string;
    };

    const { carpeta, nombre, nit_principal, nits, keywords, card_code, prompt } = body;
    if (!carpeta || !nombre || !nit_principal || !card_code) {
      return NextResponse.json({ ok: false, error: "Campos requeridos: carpeta, nombre, nit_principal, card_code" }, { status: 400 });
    }

    const db = getDb();
    const id = upsertCliente(db, {
      carpeta: carpeta.trim(),
      nombre:  nombre.trim().toUpperCase(),
      nit_principal: nit_principal.trim(),
      nits_json:     JSON.stringify(nits ?? [nit_principal]),
      keywords_json: JSON.stringify(keywords ?? []),
      card_code:     card_code.trim(),
      prompt:        prompt ?? "",
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
