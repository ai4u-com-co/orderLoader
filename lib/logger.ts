import pino from "pino";

const root = pino({ level: process.env.LOG_LEVEL ?? "info" });

export function getLogger(component: string) {
  return root.child({ component });
}
