/**
 * Unified SAP access layer.
 * OrderLoader opera EXCLUSIVAMENTE vía el gateway centralizado sap-b1-backend
 * (SAP_BACKEND_URL + SAP_BACKEND_API_KEY). El cliente directo al Service Layer
 * (lib/sap-client.ts, credenciales SAP_B1_* crudas) se retiró una vez ambos
 * tenants quedaron confirmados en modo gateway en producción.
 * Steps import from here instead of the HTTP client directly.
 */
import { getBackendClient, clearBackendClient } from "./backend-client";

export interface SapGateway {
  get<T>(endpoint: string, params?: Record<string, string>): Promise<T>;
  post<T>(endpoint: string, data: unknown): Promise<T>;
}

export async function getActiveSap(): Promise<SapGateway> {
  const backend = getBackendClient();
  if (!backend) {
    throw new Error(
      "SAP_BACKEND_URL y SAP_BACKEND_API_KEY son requeridas — OrderLoader solo opera vía el gateway sap-b1-backend",
    );
  }
  return backend;
}

export function clearActiveSap(): void {
  clearBackendClient();
}
