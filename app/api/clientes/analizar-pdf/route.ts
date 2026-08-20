import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getDb, getClienteByNit } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { detectClientFromPdf, loadClientListsFromDb } from "@/lib/pdf-classify";
import { pdfToImages, buildVisionContent } from "@/lib/pdf-vision";
import { withAnthropicRetry } from "@/lib/anthropic-retry";
import { buildMetaPrompt } from "@/lib/prompt-generation";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("pdf") as File | null;
    if (!file) return NextResponse.json({ ok: false, error: "Se requiere un archivo PDF" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ ok: false, error: "Solo se aceptan archivos PDF" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const clientNameHint = formData.get("clientNameHint") as string | null;
    const hasNameHint = !!(clientNameHint && clientNameHint.trim());

    // ── Extraer texto para detección de NIT ─────────────────────────────────
    const pdfParseFn = require("pdf-parse/lib/pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    let pdfText = "";
    try { pdfText = (await pdfParseFn(buffer)).text; } catch { /* continuar con texto vacío */ }

    const db = getDb();
    const { nits: clientNits, keywords: clientKeywords } = loadClientListsFromDb(db);

    // ── Verificar si ya existe el cliente por NIT (solo si no hay pista de nombre) ────────────────────────────
    if (!hasNameHint) {
      const detectionResult = detectClientFromPdf(pdfText, clientNits, clientKeywords);
      if (detectionResult) {
        // Buscar en DB por carpeta
        const rows = db.prepare(
          "SELECT * FROM clientes_aprobados WHERE carpeta = ? AND activo = 1"
        ).all(detectionResult.carpeta) as Array<{ id: number; carpeta: string; nombre: string; nit_principal: string }>;

        if (rows.length > 0) {
          return NextResponse.json({
            ok: true,
            existente: {
              id:      rows[0].id,
              carpeta: rows[0].carpeta,
              nombre:  rows[0].nombre,
              nit:     rows[0].nit_principal,
              metodo:  detectionResult.metodo,
            },
          });
        }
      }
    }

    // ── Nuevo cliente: analizar con IA ───────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY no configurado" }, { status: 500 });

    const { pages } = await pdfToImages(buffer);
    // Para análisis de estructura basta con las primeras páginas — mandar todo el PDF
    // genera requests demasiado pesados que causan 529 (overloaded) en Anthropic.
    const visionContent = buildVisionContent(pages.slice(0, 4));

    const client = new Anthropic({ apiKey });
    const { tenantDisplayName, cardCodePrefix } = getConfig();
    const metaPrompt = buildMetaPrompt(tenantDisplayName, cardCodePrefix, clientNameHint);

    // Intentar modelos en orden de preferencia — si uno está saturado (529), pasar al siguiente
    const MODELS_FALLBACK = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];

    let msg: Anthropic.Message | null = null;
    let lastError: unknown = null;
    for (const model of MODELS_FALLBACK) {
      try {
        msg = await withAnthropicRetry(() => client.messages.create({
          model,
          max_tokens: 8192,
          temperature: 0,
          system:   metaPrompt,
          messages: [{ role: "user", content: visionContent }],
        }));
        console.log(`[analizar-pdf] Modelo usado: ${model}`);
        break;
      } catch (e) {
        if (e instanceof Anthropic.APIError && e.status === 529) {
          console.warn(`[analizar-pdf] ${model} saturado (529), probando siguiente modelo...`);
          lastError = e;
          continue;
        }
        lastError = e;
        break;
      }
    }

    if (!msg) {
      if (lastError instanceof Anthropic.APIError && lastError.status === 529) {
        return NextResponse.json(
          { ok: false, error: "Todos los modelos de IA están saturados en este momento. Intentá en unos minutos." },
          { status: 503 }
        );
      }
      if (lastError instanceof Anthropic.APIError) {
        return NextResponse.json(
          { ok: false, error: `Error de la API de IA (${lastError.status}): ${lastError.message}` },
          { status: 502 }
        );
      }
      throw lastError;
    }

    const raw   = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    const clean = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();

    let parsed: { company_name: string; carpeta: string; nit: string; keywords: string[]; number_format: string; card_code: string; prompt: string };
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error("[analizar-pdf] Respuesta inválida del modelo:", clean.slice(0, 300));
      return NextResponse.json(
        { ok: false, error: "El modelo devolvió una respuesta inválida. Intentá con otro PDF o volvé a intentarlo." },
        { status: 500 }
      );
    }

    // Verificar duplicado por NIT en DB (solo si no hay pista de nombre)
    if (!hasNameHint) {
      const duplicate = getClienteByNit(db, parsed.nit);
      if (duplicate) {
        return NextResponse.json({
          ok: true,
          existente: {
            id:      duplicate.id,
            carpeta: duplicate.carpeta,
            nombre:  duplicate.nombre,
            nit:     duplicate.nit_principal,
            metodo:  "nit",
          },
        });
      }
    }

    return NextResponse.json({
      ok:       true,
      propuesta: {
        company_name:  parsed.company_name,
        carpeta:       parsed.carpeta,
        nit:           parsed.nit,
        keywords:      parsed.keywords ?? [],
        number_format: parsed.number_format,
        card_code:     parsed.card_code,
        prompt:        parsed.prompt,
      },
    });
  } catch (e) {
    console.error("[analizar-pdf] Error inesperado:", e);
    return NextResponse.json({ ok: false, error: `Error inesperado: ${String(e)}` }, { status: 500 });
  }
}
