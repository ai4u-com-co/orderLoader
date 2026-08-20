"use client";

import { Badge, InfoTooltip, type BadgeProps } from "@/design-system";
import { ESTADO_HELP } from "@/lib/help-content";

export const STATUS_MAP: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  NUEVO:            { label: "Nuevo",           variant: "outline"  },
  PARSED:           { label: "Parseado",         variant: "muted"    },
  PARSE_VALIDO:     { label: "Parse OK",         variant: "muted"    },
  CATALOG_OK:       { label: "Catálogo OK",      variant: "blue"     },
  SAP_NUEVO:        { label: "SAP: Nuevo",       variant: "blue"     },
  SAP_VERIFICADO:   { label: "SAP: Verificado",  variant: "blue"     },
  ITEMS_OK:         { label: "Ítems OK",         variant: "blue"     },
  SAP_MONTADO:      { label: "SAP Subido",       variant: "blue"     },
  VALIDADO:         { label: "Validado",         variant: "success"  },
  NOTIFICANDO:      { label: "Notificando",      variant: "blue"     },
  NOTIFICADO:       { label: "Notificado",       variant: "blue"     },
  CERRADO:          { label: "Cerrado",          variant: "success"  },
  ERROR_PARSE:      { label: "Error Parse",      variant: "danger"   },
  ERROR_DUPLICADO:  { label: "Duplicado",        variant: "danger"   },
  ERROR_CATALOG:    { label: "Error Catálogo",   variant: "danger"   },
  ERROR_ITEMS:      { label: "Error Ítems",      variant: "danger"   },
  ERROR_SAP:        { label: "Error SAP",        variant: "danger"   },
  ERROR_VALIDACION: { label: "Error Validación", variant: "danger"   },
  ERROR_REVISION_MANUAL: { label: "Revisión Manual", variant: "accent" },
};

export default function PipelineStatus({ estado }: { estado: string }) {
  const cfg  = STATUS_MAP[estado] ?? { label: estado, variant: "muted" as const };
  const help = ESTADO_HELP[estado as keyof typeof ESTADO_HELP];
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={cfg.variant}>{cfg.label}</Badge>
      {help && <InfoTooltip text={help} />}
    </span>
  );
}
