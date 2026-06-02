"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Logo, Text, Button, Card, Badge } from "@/design-system";

interface Cliente {
  id: number;
  carpeta: string;
  nombre: string;
  nit_principal: string;
  nits: string[];
  keywords: string[];
  card_code: string;
  activo: number;
  ts_modificado: string;
}

interface Propuesta {
  company_name: string;
  carpeta: string;
  nit: string;
  keywords: string[];
  number_format: string;
  card_code: string;
  prompt: string;
}

type ModalState =
  | { step: "closed" }
  | { step: "upload" }
  | { step: "analyzing" }
  | { step: "existente"; id: number; carpeta: string; nombre: string; nit: string }
  | { step: "revisar"; propuesta: Propuesta }
  | { step: "guardando" };

export default function ClientesPage() {
  const [clientes, setClientes]         = useState<Cliente[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [modal, setModal]               = useState<ModalState>({ step: "closed" });
  const [formData, setFormData]         = useState<Propuesta | null>(null);
  const [saveError, setSaveError]       = useState<string | null>(null);
  const [cardCodePrefix, setCardCodePrefix] = useState("CN");
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  const fetchClientes = useCallback(async () => {
    try {
      const res  = await fetch("/api/clientes");
      const data = await res.json() as { ok: boolean; clientes?: Cliente[]; cardCodePrefix?: string; error?: string };
      if (data.ok) {
        setClientes(data.clientes ?? []);
        if (data.cardCodePrefix) setCardCodePrefix(data.cardCodePrefix);
        setError(null);
      } else setError(data.error ?? "Error desconocido");
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  async function handleFileUpload(file: File) {
    setModal({ step: "analyzing" });
    setSaveError(null);
    const fd = new FormData();
    fd.append("pdf", file);
    try {
      const res  = await fetch("/api/clientes/analizar-pdf", { method: "POST", body: fd });
      const data = await res.json() as {
        ok: boolean; error?: string;
        existente?: { id: number; carpeta: string; nombre: string; nit: string; metodo: string };
        propuesta?: Propuesta;
      };
      if (!data.ok) { setModal({ step: "upload" }); setSaveError(data.error ?? "Error al analizar PDF"); return; }
      if (data.existente) {
        setModal({ step: "existente", id: data.existente.id, carpeta: data.existente.carpeta, nombre: data.existente.nombre, nit: data.existente.nit });
      } else if (data.propuesta) {
        setFormData(data.propuesta);
        setModal({ step: "revisar", propuesta: data.propuesta });
      }
    } catch (e) { setModal({ step: "upload" }); setSaveError(String(e)); }
  }

  async function handleGuardar() {
    if (!formData) return;
    setModal({ step: "guardando" });
    setSaveError(null);
    try {
      const res  = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carpeta:       formData.carpeta,
          nombre:        formData.company_name,
          nit_principal: formData.nit,
          nits:          [formData.nit],
          keywords:      formData.keywords,
          card_code:     formData.card_code,
          prompt:        formData.prompt,
        }),
      });
      const data = await res.json() as { ok: boolean; id?: number; error?: string };
      if (data.ok) {
        setModal({ step: "closed" });
        setFormData(null);
        await fetchClientes();
      } else {
        setModal({ step: "revisar", propuesta: formData });
        setSaveError(data.error ?? "Error al guardar");
      }
    } catch (e) {
      setModal({ step: "revisar", propuesta: formData });
      setSaveError(String(e));
    }
  }

  const activos   = clientes.filter(c => c.activo === 1).length;
  const inactivos = clientes.length - activos;

  return (
    <div className="min-h-screen bg-mint-cream text-erie-black">
      {/* Header */}
      <header className="border-b border-erie-black/10 bg-mint-cream/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/">
            <Logo version="v1" color="negro" height={28} />
          </Link>
          <div className="w-px h-6 bg-erie-black/15" />
          <div>
            <Text variant="bodyBold" as="span" className="text-sm leading-none">Clientes Aprobados</Text>
            <Text variant="xs" as="div" className="mt-0.5">Gestión de clientes y prompts de extracción</Text>
          </div>
          <Link href="/" className="ml-auto text-xs text-cadet-gray hover:text-erie-black transition-colors">
            ← Pedidos
          </Link>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8 flex flex-col gap-6">
        {/* Stats + action */}
        <div className="flex items-center gap-4 flex-wrap">
          <Card variant="elevated" padding="md" className="flex gap-6">
            <div>
              <div className="text-2xl font-black font-mono leading-none text-moderate-blue">{activos}</div>
              <Text variant="xs">Activos</Text>
            </div>
            <div className="w-px bg-erie-black/10" />
            <div>
              <div className="text-2xl font-black font-mono leading-none text-cadet-gray">{inactivos}</div>
              <Text variant="xs">Inactivos</Text>
            </div>
          </Card>
          <Button variant="primary" size="md" onClick={() => { setSaveError(null); setModal({ step: "upload" }); }}>
            + Agregar cliente desde PDF
          </Button>
        </div>

        {/* Grid de clientes */}
        {loading ? (
          <div className="py-16 text-center text-cadet-gray text-sm">Cargando…</div>
        ) : error ? (
          <Card variant="elevated" padding="lg">
            <div className="text-hot-orange text-sm">{error}</div>
          </Card>
        ) : clientes.length === 0 ? (
          <Card variant="light" padding="lg">
            <div className="text-center text-cadet-gray text-sm py-8">
              No hay clientes configurados. Ejecuta <strong>Migrate</strong> para cargar los clientes base, o sube un PDF para agregar uno nuevo.
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {clientes.map(c => (
              <Link key={c.id} href={`/clientes/${c.id}`}>
                <Card
                  variant="elevated"
                  padding="md"
                  className="h-full hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <Text variant="bodyBold" className="text-sm leading-tight group-hover:text-moderate-blue transition-colors">
                      {c.nombre}
                    </Text>
                    <Badge variant={c.activo === 1 ? "success" : "muted"} size="sm">
                      {c.activo === 1 ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <div className="font-mono text-xs text-cadet-gray">NIT {c.nit_principal}</div>
                    <div className="font-mono text-xs text-cadet-gray">{c.card_code}</div>
                    <div className="text-xs text-cadet-gray/70 truncate">
                      {c.keywords.slice(0, 3).join(", ")}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-erie-black/5 text-xs text-cadet-gray/60 font-mono">
                    {c.carpeta}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Modal */}
      {modal.step !== "closed" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-erie-black/40 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget && modal.step !== "analyzing" && modal.step !== "guardando") setModal({ step: "closed" }); }}
        >
          <Card variant="elevated" padding="lg" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">

            {/* Upload */}
            {modal.step === "upload" && (
              <div className="flex flex-col gap-4">
                <Text variant="h3">Agregar cliente desde PDF</Text>
                <Text variant="body" className="text-cadet-gray text-sm">
                  Sube una orden de compra del nuevo cliente. La IA identificará la empresa, construirá el prompt de extracción, y lo agregará a los clientes aprobados.
                </Text>
                {saveError && <div className="text-hot-orange text-sm rounded-lg border border-hot-orange/30 bg-hot-orange/5 px-3 py-2">{saveError}</div>}
                <div
                  className="border-2 border-dashed border-erie-black/20 rounded-xl p-10 text-center cursor-pointer hover:border-moderate-blue/50 hover:bg-moderate-blue/5 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
                >
                  <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
                  <div className="text-4xl mb-3">📄</div>
                  <Text variant="bodyBold" className="text-sm">Arrastra un PDF o haz clic para seleccionar</Text>
                  <Text variant="xs" className="text-cadet-gray mt-1">Solo archivos .pdf</Text>
                </div>
                <div className="flex justify-end">
                  <Button variant="secondary" size="md" onClick={() => setModal({ step: "closed" })}>Cancelar</Button>
                </div>
              </div>
            )}

            {/* Analyzing */}
            {modal.step === "analyzing" && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="text-4xl animate-pulse">🔍</div>
                <Text variant="h3">Analizando PDF con IA…</Text>
                <Text variant="body" className="text-cadet-gray text-sm text-center">
                  Claude está identificando la empresa y construyendo el prompt de extracción. Esto puede tomar unos segundos.
                </Text>
              </div>
            )}

            {/* Existente */}
            {modal.step === "existente" && (
              <div className="flex flex-col gap-4">
                <Text variant="h3">Cliente ya existe</Text>
                <div className="rounded-xl border border-moderate-blue/30 bg-moderate-blue/5 px-4 py-3">
                  <Text variant="bodyBold" className="text-sm">{modal.nombre}</Text>
                  <div className="text-xs text-cadet-gray font-mono mt-1">NIT {modal.nit} · {modal.carpeta}</div>
                </div>
                <Text variant="body" className="text-cadet-gray text-sm">
                  El PDF corresponde a un cliente ya registrado. Puedes ver o editar su configuración.
                </Text>
                <div className="flex gap-3 justify-end">
                  <Button variant="secondary" size="md" onClick={() => setModal({ step: "closed" })}>Cerrar</Button>
                  <Link href={`/clientes/${modal.id}`}>
                    <Button variant="primary" size="md" onClick={() => setModal({ step: "closed" })}>
                      Ver cliente →
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Revisar propuesta */}
            {modal.step === "revisar" && formData && (
              <div className="flex flex-col gap-4">
                <Text variant="h3">Revisar nuevo cliente</Text>
                <Text variant="body" className="text-cadet-gray text-sm">Revisa y ajusta la información extraída antes de guardar.</Text>
                {saveError && <div className="text-hot-orange text-sm rounded-lg border border-hot-orange/30 bg-hot-orange/5 px-3 py-2">{saveError}</div>}

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-cadet-gray">Nombre empresa</span>
                    <input className="border border-erie-black/20 rounded-lg px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-moderate-blue/30"
                      value={formData.company_name} onChange={e => setFormData(p => p ? { ...p, company_name: e.target.value } : p)} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-cadet-gray">Carpeta (ID único)</span>
                    <input className="border border-erie-black/20 rounded-lg px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-moderate-blue/30"
                      value={formData.carpeta} onChange={e => setFormData(p => p ? { ...p, carpeta: e.target.value } : p)} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-cadet-gray">NIT</span>
                    <input className="border border-erie-black/20 rounded-lg px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-moderate-blue/30"
                      value={formData.nit} onChange={e => setFormData(p => p ? { ...p, nit: e.target.value, card_code: `${cardCodePrefix}${e.target.value}` } : p)} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-cadet-gray">CardCode SAP</span>
                    <input className="border border-erie-black/20 rounded-lg px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-moderate-blue/30"
                      value={formData.card_code} onChange={e => setFormData(p => p ? { ...p, card_code: e.target.value } : p)} />
                  </label>
                </div>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-cadet-gray">Keywords (separadas por coma)</span>
                  <input className="border border-erie-black/20 rounded-lg px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-moderate-blue/30"
                    value={formData.keywords.join(", ")}
                    onChange={e => setFormData(p => p ? { ...p, keywords: e.target.value.split(",").map(k => k.trim()).filter(Boolean) } : p)} />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-cadet-gray">Prompt de extracción</span>
                  <textarea
                    className="border border-erie-black/20 rounded-lg px-3 py-2 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-moderate-blue/30 resize-y"
                    rows={12}
                    value={formData.prompt}
                    onChange={e => setFormData(p => p ? { ...p, prompt: e.target.value } : p)}
                  />
                </label>

                <div className="flex gap-3 justify-end pt-2">
                  <Button variant="secondary" size="md" onClick={() => { setModal({ step: "upload" }); setSaveError(null); }}>
                    ← Volver
                  </Button>
                  <Button variant="primary" size="md" onClick={handleGuardar}>
                    Guardar cliente
                  </Button>
                </div>
              </div>
            )}

            {/* Guardando */}
            {modal.step === "guardando" && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="text-4xl animate-pulse">💾</div>
                <Text variant="h3">Guardando cliente…</Text>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
