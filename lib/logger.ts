// Logger de OrderLoader — ahora delega en el logger central @ai4u/platform/logger
// (niveles, JSON|text, redacción de secretos y transporte opcional a Supabase).
// Se conserva el API histórico (getLogger / setRunContext / clearRunContext) y la
// semántica GLOBAL del contexto de corrida (el pipeline corre como proceso largo en
// el VM, no por request, así que el contexto NO es AsyncLocalStorage-scoped).
import { getLogger as _getLogger } from "@ai4u/platform/logger";

// Contexto inyectado por corrida (p.ej. { pipeline_run_id }). Global a propósito.
let _runContext: Record<string, unknown> = {};
export function setRunContext(ctx: Record<string, unknown>): void {
  _runContext = ctx;
}
export function clearRunContext(): void {
  _runContext = {};
}

type LogMethod = {
  (msg: string): void;
  (fields: Record<string, unknown>, msg: string): void;
};

class Logger {
  private readonly base: ReturnType<typeof _getLogger>;
  readonly debug: LogMethod;
  readonly info: LogMethod;
  readonly warn: LogMethod;
  readonly error: LogMethod;

  constructor(private readonly name: string) {
    this.base = _getLogger(name);
    this.debug = this.make("debug");
    this.info = this.make("info");
    this.warn = this.make("warn");
    this.error = this.make("error");
  }

  private make(level: "debug" | "info" | "warn" | "error"): LogMethod {
    return ((fieldsOrMsg: Record<string, unknown> | string, msg?: string) => {
      if (typeof fieldsOrMsg === "string") {
        this.base[level]({ ..._runContext }, fieldsOrMsg);
      } else {
        this.base[level]({ ..._runContext, ...fieldsOrMsg }, msg ?? "");
      }
    }) as LogMethod;
  }

  child(bindings: Record<string, unknown>): Logger {
    return new Logger((bindings.component as string) ?? this.name);
  }
}

export function getLogger(component: string): Logger {
  return new Logger(component);
}
