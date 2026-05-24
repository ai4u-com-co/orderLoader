import { NextResponse } from "next/server";
import { migrate } from "@/lib/db";
import { seedClientes } from "@/lib/clientes-seed";
import { seedClientesFlexo } from "@/lib/clientes-seed-flexo";
import Database from "better-sqlite3";
import { getConfig } from "@/lib/config";

export async function POST() {
  try {
    migrate();
    const config = getConfig();
    const db = new Database(config.dbPath);
    db.pragma("journal_mode = WAL");
    const { inserted } = config.tenant === "flexoimpresos"
      ? seedClientesFlexo(db)
      : seedClientes(db);
    db.close();
    return NextResponse.json({
      ok: true,
      message: `DB migrada correctamente${inserted > 0 ? ` (${inserted} clientes sembrados)` : ""}`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
