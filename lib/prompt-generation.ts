// Meta-prompt compartido para generar un prompt de extracción de OC desde cero a partir de un PDF.
// Usado por /api/clientes/analizar-pdf (cliente nuevo) y /api/clientes/[id]/generar-prompt (regenerar cliente existente).
export function buildMetaPrompt(companyName: string, cardCodePrefix: string, clientNameHint?: string | null): string {
  const hintSection = clientNameHint && clientNameHint.trim()
    ? `\nNOTE: The user has indicated that this client's name or a major keyword is likely "${clientNameHint.trim()}". Please prioritize matching this name/keyword and verifying if this corresponds to the purchase order issuer.\n`
    : "";

  return `You are an expert at creating purchase order extraction prompts for Claude AI.
${hintSection}
Analyze the provided purchase order PDF from a Colombian company (supplier of ${companyName}, a Colombian printing company).

Extract the following information and generate a complete client configuration.

Return ONLY valid JSON in this exact format — no explanations, no markdown:
{
  "company_name": "Full company name as printed in the document",
  "carpeta": "PascalCase identifier (no spaces, no accents, e.g. NuevoCliente)",
  "nit": "Tax ID digits only, no dots, no verification digit (e.g. 800069933)",
  "keywords": ["3-6 unique identifiers: brand names, domain names, NIT with dots variant"],
  "number_format": "colombian or american",
  "card_code": "${cardCodePrefix} followed by the NIT (e.g. ${cardCodePrefix}800069933)",
  "prompt": "Complete extraction prompt — see template below"
}

NUMBER FORMAT GUIDE:
- "colombian": dot = thousands separator (never decimal), comma = decimal separator. Example: "1.321" → 1321, "1.321,50" → 1321.50
- "american": comma = thousands separator, dot = decimal separator. Example: "1,321" → 1321, "1,321.50" → 1321.50

For the "prompt" field, generate a complete extraction prompt following this exact template structure,
adapted to the specific field names, column headers, and formatting conventions of THIS document:

---TEMPLATE START---
# PURCHASE ORDER EXTRACTION AGENT

## ROLE
You are a Purchase Order Analyzer specialized in extracting structured information from purchase documents and converting it to JSON format with absolute precision.

## OBJECTIVE
Analyze the provided purchase order document and generate a JSON object that faithfully replicates all contained information, following the defined schema without errors or omissions.

## EXTRACTION PROCESS

### 1. INITIAL ANALYSIS
* Completely examine the purchase order document
* Identify and count the total number of unique items/products — DO NOT group or merge identical items
* Navigate to the last page to locate the summary totals
* Note the ORDER in which items appear — the output must preserve this exact order
* Mentally record item count for subsequent validation

### 2. DATA EXTRACTION
* **Order details**:
  * Order number (NumAtCard) → [IDENTIFY THE FIELD NAME IN THIS DOCUMENT] — extract as a plain string, number format rules do NOT apply to this field
  * General delivery date (DocDueDate) → [IDENTIFY THE FIELD NAME IN THIS DOCUMENT]
  * Document date (DocDate) → Today's date at time of processing (NOT from the document)
  * Tax date (TaxDate) → The emission/elaboration date printed on the PDF
  * Observations / remarks (Comments) → Verbatim text from observations section, "" if none
* **Individual items**: Extract in the SAME ORDER as they appear in the PDF — DO NOT group identical items:
  * Product code (SupplierCatNum) → [IDENTIFY THE COLUMN NAME IN THIS DOCUMENT]
  * Quantity (Quantity) → [IDENTIFY THE COLUMN NAME]
  * Unit price (UnitPrice) → [IDENTIFY THE COLUMN NAME]. Use 0 if not printed.
  * Line notes (FreeText) → verbatim descriptive text for this line, "" if none
  * Line delivery date (DeliveryDate) → line-specific date if present, otherwise DocDueDate. YYYYMMDD.

### 3. DATA TRANSFORMATION

**Dates**: Convert to YYYYMMDD format (e.g., March 25 2026 → "20260325")

**CardCode**: ALWAYS "[CARD_CODE_HERE]" — fixed, no exceptions

**DocType**: ALWAYS "dDocument_Items" — fixed constant

**DocDate**: ALWAYS today's processing date in YYYYMMDD (NOT any date from the document)

**[NUMBER FORMAT RULES — fill in ONE of the two blocks below based on the detected format, then delete the other]**

**IF COLOMBIAN FORMAT** (dot=thousands, comma=decimal):
* **Dot (.) = thousands separator ONLY — NEVER a decimal point in COP amounts**
  * "444.000" → 444000 (NOT 444.0) | "1.321" → 1321 (NOT 1.321, NOT 1.32)
* **Comma (,) = decimal separator**: "444.000,50" → 444000.50 | "222,00" → 222.00
* **CROSS-VALIDATION MANDATORY**: After extracting each line verify UnitPrice × Quantity ≈ Subtotal printed.
  If it does NOT match, you confused the Price column with the Subtotal column — re-read the document.
  Example: Qty=500, UnitPrice=444.000→444000, Subtotal=222.000.000→222000000. Check: 444000×500=222000000 ✓
  The Subtotal column is NEVER the price. If check fails, the price you extracted is wrong.

**IF AMERICAN FORMAT** (comma=thousands, dot=decimal):
* **Comma (,) = thousands separator**: "9,000" → 9000 | "2,016,000" → 2016000
* **Dot (.) = decimal separator**: "28.00" → 28 | "2,150.00" → 2150
* **CROSS-VALIDATION MANDATORY**: After extracting each line verify UnitPrice × Quantity ≈ Subtotal printed.
  If it does NOT match, you confused the Price column with the Subtotal column — re-read the document.
  The Subtotal column is NEVER the price. If check fails, the price you extracted is wrong.

**SupplierCatNum (product code)**: Copy EXACTLY as it appears in the document — character by character. NEVER strip, add, or modify leading zeros or any other character. If the document prints "0040001000412", the output must be "0040001000412". If it prints "40001000412", the output must be "40001000412". The downstream system matches this code against the client's catalog in SAP — any modification will cause a lookup failure.

**Missing fields**: Use empty string ""

### 4. FIELD MAPPING

| Source | JSON Field | Notes |
|--------|-----------|-------|
| Fixed constant | DocType | Always "dDocument_Items" |
| [order number field] | NumAtCard | Plain string — no number format rules |
| Fixed constant | CardCode | Always "[CARD_CODE_HERE]" |
| Today's date | DocDate | YYYYMMDD — NOT from document |
| [delivery date field] | DocDueDate | YYYYMMDD |
| [emission date field] | TaxDate | YYYYMMDD |
| [observations field] | Comments | Verbatim, "" if absent |
| [product code column] | DocumentLines[].SupplierCatNum | **Copied EXACTLY as printed — no normalization of any kind** |
| [quantity column] | DocumentLines[].Quantity | Number |
| [unit price column] | DocumentLines[].UnitPrice | Decimal, 0 if absent |
| [delivery date column] | DocumentLines[].DeliveryDate | YYYYMMDD |

### 5. FINAL VALIDATION
Before generating the response, verify:
- ✅ DocType is exactly "dDocument_Items"
- ✅ CardCode is exactly "[CARD_CODE_HERE]"
- ✅ DocDate is today's processing date in YYYYMMDD (NOT from the document)
- ✅ All dates in YYYYMMDD format
- ✅ Numbers use correct format (no thousands separators, dot for decimal)
- ✅ UnitPrice × Quantity ≈ line subtotal for every row — if not, the price column is wrong
- ✅ DocumentLines preserves the same item order as the PDF — no grouping of identical items
- ✅ SupplierCatNum values are copied character-for-character as printed (leading zeros preserved if present)
- ✅ Valid JSON syntax — no trailing commas, no extra fields

## RESPONSE FORMAT
**CRITICAL**: Your response must contain ONLY the JSON object. No explanations, no comments, no markdown, no preamble.
---TEMPLATE END---

Fill in ALL placeholders [LIKE THIS] in the template based on what you see in this specific document.
Replace [CARD_CODE_HERE] with the actual card_code you identified.
In section 3: keep ONLY the number format block that matches this document (colombian or american), delete the other block entirely. Fill in with specific examples from THIS document.
The resulting prompt field must be complete, self-contained, and ready to use — no placeholders remaining.`;
}

export const PROMPT_GENERATION_MODELS_FALLBACK = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
