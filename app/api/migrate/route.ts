import { NextResponse } from "next/server";
import { migrate } from "@/lib/db";
import { seedClientes } from "@/lib/clientes-seed";
import { seedClientesFlexo } from "@/lib/clientes-seed-flexo";
import { FLEXO_SPECIFIC_PROMPTS } from "@/lib/flexo-prompts-generated";
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

    let promptsApplied = 0;
    if (config.tenant === "flexoimpresos") {
      const stmt = db.prepare("UPDATE clientes_aprobados SET prompt = ? WHERE carpeta = ?");
      for (const [carpeta, prompt] of Object.entries(FLEXO_SPECIFIC_PROMPTS)) {
        const res = stmt.run(prompt, carpeta);
        promptsApplied += res.changes;
      }
    }

    db.close();
    const parts = [];
    if (inserted > 0) parts.push(`${inserted} clientes sembrados`);
    if (promptsApplied > 0) parts.push(`${promptsApplied} prompts específicos aplicados`);
    return NextResponse.json({
      ok: true,
      message: `DB migrada correctamente${parts.length ? ` (${parts.join(", ")})` : ""}`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
