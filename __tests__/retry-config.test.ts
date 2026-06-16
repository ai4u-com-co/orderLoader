import { describe, it, expect } from "vitest";
import { retryConfig } from "@/app/api/pedidos/[id]/retry/route";

describe("retryConfig", () => {
  it("ERROR_PARSE en fase temprana reencola desde step1", () => {
    expect(retryConfig("ERROR_PARSE", 1)).toEqual({ resetTo: "NUEVO", fromStep: 1 });
  });

  it("ERROR_PARSE en fase posterior reencola desde step2", () => {
    expect(retryConfig("ERROR_PARSE", 2)).toEqual({ resetTo: "PARSED", fromStep: 2 });
  });

  it("ERROR_ITEMS / ERROR_SAP reencolan desde step3", () => {
    expect(retryConfig("ERROR_ITEMS", 4)).toEqual({ resetTo: "PARSE_VALIDO", fromStep: 3 });
    expect(retryConfig("ERROR_SAP", 4)).toEqual({ resetTo: "PARSE_VALIDO", fromStep: 3 });
  });

  it("ERROR_CATALOG reencola desde step3 (catálogo SAP transitorio)", () => {
    expect(retryConfig("ERROR_CATALOG", 3)).toEqual({ resetTo: "PARSE_VALIDO", fromStep: 3 });
  });

  it("ERROR_VALIDACION reencola desde step5", () => {
    expect(retryConfig("ERROR_VALIDACION", 5)).toEqual({ resetTo: "SAP_MONTADO", fromStep: 5 });
  });

  it("estados no reintentables retornan null", () => {
    expect(retryConfig("CERRADO", 7)).toBeNull();
    expect(retryConfig("SAP_MONTADO", 4)).toBeNull();
  });
});
