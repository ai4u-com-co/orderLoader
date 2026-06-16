import { describe, it, expect } from "vitest";
import { odataEscape, odataString } from "@/lib/odata";

describe("odataEscape", () => {
  it("deja valores sin comillas intactos", () => {
    expect(odataEscape("4500288469")).toBe("4500288469");
    expect(odataEscape("Y-1-18418")).toBe("Y-1-18418");
  });

  it("duplica comillas simples (escape OData v4)", () => {
    expect(odataEscape("O'Brien")).toBe("O''Brien");
    expect(odataEscape("a'b'c")).toBe("a''b''c");
  });

  it("tolera valores no-string (null/undefined) sin lanzar", () => {
    expect(odataEscape(null as unknown as string)).toBe("");
    expect(odataEscape(undefined as unknown as string)).toBe("");
  });
});

describe("odataString", () => {
  it("entrecomilla y escapa", () => {
    expect(odataString("4500288469")).toBe("'4500288469'");
    expect(odataString("O'Brien")).toBe("'O''Brien'");
  });

  it("produce un filtro que no se puede romper inyectando comillas", () => {
    // Una OC maliciosa/accidental no debe cerrar el literal prematuramente.
    const oc = "x' or DocEntry gt '0";
    const filter = `NumAtCard eq ${odataString(oc)}`;
    expect(filter).toBe("NumAtCard eq 'x'' or DocEntry gt ''0'");
  });
});
