import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getDb, getClienteById } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { pdfToImages, buildVisionContent } from "@/lib/pdf-vision";
import { withAnthropicRetry } from "@/lib/anthropic-retry";
import { buildMetaPrompt, PROMPT_GENERATION_MODELS_FALLBACK } from "@/lib/prompt-generation";

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const db = getDb();
    const existing = getClienteById(db, Number(id));
    if (!existing) return NextResponse.json({ ok: false, error: "Cliente no encontrado" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return NextResponse.json({ ok: false, error: "Se requiere un archivo PDF" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ ok: false, error: "Solo se aceptan archivos PDF" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY no configurado" }, { status: 500 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const { pages } = await pdfToImages(buffer);
    const visionContent = buildVisionContent(pages.slice(0, 4));

    const client = new Anthropic({ apiKey });
    const { tenantDisplayName, cardCodePrefix } = getConfig();
    const metaPrompt = buildMetaPrompt(tenantDisplayName, cardCodePrefix, existing.nombre);

    let msg: Anthropic.Message | null = null;
    let lastError: unknown = null;
    for (const model of PROMPT_GENERATION_MODELS_FALLBACK) {
      try {
        msg = await withAnthropicRetry(() => client.messages.create({
          model,
          max_tokens: 8192,
          temperature: 0,
          system:   metaPrompt,
          messages: [{ role: "user", content: visionContent }],
        }));
        console.log(`[generar-prompt] Modelo usado: ${model}`);
        break;
      } catch (e) {
        if (e instanceof Anthropic.APIError && e.status === 529) {
          console.warn(`[generar-prompt] ${model} saturado (529), probando siguiente modelo...`);
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

    let parsed: { prompt?: string };
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error("[generar-prompt] Respuesta inválida del modelo:", clean.slice(0, 300));
      return NextResponse.json(
        { ok: false, error: "El modelo devolvió una respuesta inválida. Intentá con otro PDF o volvé a intentarlo." },
        { status: 500 }
      );
    }

    if (!parsed.prompt) {
      return NextResponse.json({ ok: false, error: "El modelo no devolvió un prompt." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, generated_prompt: parsed.prompt });
  } catch (e) {
    console.error("[generar-prompt] Error inesperado:", e);
    return NextResponse.json({ ok: false, error: `Error inesperado: ${String(e)}` }, { status: 500 });
  }
}
