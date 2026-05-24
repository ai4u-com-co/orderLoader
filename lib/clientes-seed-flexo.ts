/**
 * Seed data para clientes_aprobados — tenant FlexoImpresos.
 * CardCode format: "C" + NIT (sin dígito de verificación).
 */
import type Database from "better-sqlite3";

// Genera el prompt de extracción para un cliente de FlexoImpresos.
// El CardCode es el único campo que varía por cliente; el resto es genérico.
function makePrompt(cardCode: string, nombreCliente: string): string {
  return `# PURCHASE ORDER EXTRACTION AGENT — FLEXO IMPRESOS

## ROLE
You are a Purchase Order Analyzer specialized in extracting structured information from purchase documents directed to FLEXO IMPRESOS S.A.S. (NIT 900528680) and converting it to JSON format with absolute precision.

## OBJECTIVE
Analyze the provided purchase order document from ${nombreCliente} and generate a JSON object following the SAP B1 schema exactly.

## EXTRACTION PROCESS

### 1. INITIAL ANALYSIS
* Examine the purchase order document completely
* Identify and count the total number of unique items/products
* Mentally record this for validation

### 2. DATA EXTRACTION
* **Order number (NumAtCard)**: The client's purchase order number as printed — copy it exactly, including any prefixes (OC, OCN, OR, OP, ORCOM, etc.)
* **Document date (DocDate)**: Always use today's processing date in YYYYMMDD format (NOT from the document)
* **Due date (DocDueDate)**: The requested delivery date from the document. If not found, use DocDate + 15 days.
* **Tax date (TaxDate)**: The document creation date printed on the PDF, in YYYYMMDD format. If not found, use DocDate.
* **Observations (Comments)**: Copy verbatim any text in "Observaciones", "Comentarios", "Notas", or similar sections. Use "" if none.
* **Items**: For each product line in the SAME ORDER as they appear:
  * Code (SupplierCatNum): The item/article code or reference as printed. Remove leading zeros.
  * Quantity (Quantity): Integer number of units requested.
  * Unit price (UnitPrice): Price per unit as printed in the document.
  * Line delivery date (DeliveryDate): Specific delivery date for this line in YYYYMMDD. If absent, use DocDueDate.
  * Line notes (FreeText): Any description, color, size, or special instructions for this line. Use "" if none.

### 3. MANDATORY TRANSFORMATIONS

**CardCode**: Always use "${cardCode}" regardless of any value in the document.

**Dates**: Convert ALL dates to YYYYMMDD format.
* "13/05/2026" → "20260513"
* "9/05/2026" → "20260509"
* "2026/04/21" → "20260421"
* "30/01/2026" → "20260130"

**Numbers — CRITICAL (Colombian format)**:
* Dot "." = thousands separator (NEVER decimal)
* Comma "," = decimal separator
* "1.260.000" → 1260000
* "504,00" → 504.00
* "1.260,50" → 1260.50
* "2.500" → 2500 (NOT 2.5)
* Quantities: always integers (2500, not 2500.00)

**SupplierCatNum**: Remove leading zeros ("00021446" → "21446"). If only a description exists (no code), use the first 20 characters of the description.

### 4. OUTPUT FORMAT
Return ONLY the JSON object, no explanations:

\`\`\`json
{
  "DocType": "dDocument_Items",
  "NumAtCard": "<OC number exactly as printed>",
  "CardCode": "${cardCode}",
  "DocDate": "<today YYYYMMDD>",
  "DocDueDate": "<delivery date YYYYMMDD>",
  "TaxDate": "<document date YYYYMMDD>",
  "Comments": "<observations or empty string>",
  "DocumentLines": [
    {
      "SupplierCatNum": "<item code>",
      "Quantity": <integer>,
      "UnitPrice": <decimal>,
      "DeliveryDate": "<YYYYMMDD>",
      "FreeText": "<line description or empty string>"
    }
  ]
}
\`\`\`

### 5. VALIDATION
Before outputting, verify:
* Number of lines matches the document
* All dates are in YYYYMMDD format
* CardCode is exactly "${cardCode}"
* All quantities are positive integers
* NumAtCard is present and non-empty`;
}

interface ClienteFlexo {
  carpeta: string;
  nombre: string;
  nit: string;
  cardCode: string;
  keywords: string[];
}

const CLIENTES_FLEXO: ClienteFlexo[] = [
  { carpeta: "AkitaMotos",            nombre: "AKITA MOTOS S.A.",                                    nit: "800030412", cardCode: "C800030412", keywords: ["akita motos", "800030412"] },
  { carpeta: "AlimentosNebraska",     nombre: "ALIMENTOS NEBRASKA S.A.S.",                           nit: "811041074", cardCode: "C811041074", keywords: ["alimentos nebraska", "nebraska", "811041074"] },
  { carpeta: "AmeniGroup",            nombre: "AMENI GROUP S.A.S",                                   nit: "900871932", cardCode: "C900871932", keywords: ["ameni group", "ameni", "900871932"] },
  { carpeta: "AutocoMobility",        nombre: "AUTECO MOBILITY S.A.S.",                              nit: "901249413", cardCode: "C901249413", keywords: ["auteco mobility", "auteco", "901249413"] },
  { carpeta: "AutotecnicaColombiana", nombre: "AUTOTECNICA COLOMBIANA S.A.S.",                       nit: "890900317", cardCode: "C890900317", keywords: ["autotecnica colombiana", "autotecnica", "890900317"] },
  { carpeta: "CarnicosAlimentos",     nombre: "CARNICOS Y ALIMENTOS S.A.S.",                         nit: "900134841", cardCode: "C900134841", keywords: ["carnicos y alimentos", "carnicos", "900134841"] },
  { carpeta: "Cedimed",               nombre: "CEDIMED S.A.S.",                                      nit: "811007144", cardCode: "C811007144", keywords: ["cedimed", "811007144"] },
  { carpeta: "ClinicaCardioVid",      nombre: "CLINICA CARDIO VID",                                  nit: "811046900", cardCode: "C811046900", keywords: ["clinica cardio vid", "cardio vid", "811046900"] },
  { carpeta: "Colpagro",              nombre: "COLOMBIANA DE PRODUCTOS DEL AGRO COLPAGRO S.A.S",     nit: "800043278", cardCode: "C800043278", keywords: ["colpagro", "800043278"] },
  { carpeta: "ColombianaCeramicas",   nombre: "COMPAÑIA COLOMBIANA DE CERAMICAS S A S",              nit: "860002536", cardCode: "C860002536", keywords: ["colombiana de ceramicas", "ceramicas", "860002536"] },
  { carpeta: "CosmeticosSamy",        nombre: "COSMETICOS SAMY S.A.",                                nit: "811008383", cardCode: "C811008383", keywords: ["cosmeticos samy", "samy", "811008383"] },
  { carpeta: "CruzRoja",              nombre: "CRUZ ROJA COLOMBIANA SECCIONAL ANTIOQUIA",            nit: "890980074", cardCode: "C890980074", keywords: ["cruz roja colombiana", "cruz roja", "890980074"] },
  { carpeta: "Crystal",               nombre: "CRYSTAL S.A.S",                                       nit: "890901672", cardCode: "C890901672", keywords: ["crystal s.a.s", "crystal", "890901672"] },
  { carpeta: "CuerosVelez",           nombre: "CUEROS VELEZ S.A.S.",                                 nit: "800191700", cardCode: "C800191700", keywords: ["cueros velez", "velez", "800191700"] },
  { carpeta: "Disproaseo",            nombre: "DISPROASEO S.A.S.",                                   nit: "811032378", cardCode: "C811032378", keywords: ["disproaseo", "811032378"] },
  { carpeta: "EliteMaxNutrition",     nombre: "ELITE MAX NUTRITION S.A.S.",                          nit: "900269388", cardCode: "C900269388", keywords: ["elite max nutrition", "elite max", "900269388"] },
  { carpeta: "EmpresaCosmeticos",     nombre: "EMPRESA DE COSMETICOS Y SERVICIOS S.A.",              nit: "890923922", cardCode: "C890923922", keywords: ["empresa de cosmeticos", "cosmeticos y servicios", "890923922"] },
  { carpeta: "Essentiall",            nombre: "ESSENTIALL SAS",                                      nit: "811043026", cardCode: "C811043026", keywords: ["essentiall", "811043026"] },
  { carpeta: "Extrusiones",           nombre: "EXTRUSIONES S.A.",                                    nit: "890931708", cardCode: "C890931708", keywords: ["extrusiones", "890931708"] },
  { carpeta: "FamiliaDelPacifico",    nombre: "FAMILIA DEL PACIFICO S.A.S",                          nit: "817000680", cardCode: "C817000680", keywords: ["familia del pacifico", "familia pacifico", "817000680"] },
  { carpeta: "Gropius",               nombre: "GROPIUS INNOVACIÓN SOCIEDAD POR ACCIONES SIMPLIFICADA", nit: "900715034", cardCode: "C900715034", keywords: ["gropius", "900715034"] },
  { carpeta: "GroupeSeb",             nombre: "GROUPE SEB COLOMBIA S.A.",                            nit: "890900307", cardCode: "C890900307", keywords: ["groupe seb", "groupeseb", "890900307"] },
  { carpeta: "Improbell",             nombre: "IMPROBELL SOCIEDAD POR ACCIONES SIMPLIFICADA",        nit: "830042822", cardCode: "C830042822", keywords: ["improbell", "830042822"] },
  { carpeta: "Incametal",             nombre: "INCAMETAL S.A.S.",                                    nit: "890900104", cardCode: "C890900104", keywords: ["incametal", "890900104"] },
  { carpeta: "IndustriasFrotex",      nombre: "INDUSTRIAS FROTEX",                                   nit: "890939742", cardCode: "C890939742", keywords: ["industrias frotex", "frotex", "890939742"] },
  { carpeta: "IngredientesFuncionales", nombre: "INGREDIENTES Y PRODUCTOS FUNCIONALES S.A.S.",       nit: "811006722", cardCode: "C811006722", keywords: ["ingredientes y productos funcionales", "ipf", "811006722"] },
  { carpeta: "Interdoors",            nombre: "INTERDOORS S.A.S",                                    nit: "900682082", cardCode: "C900682082", keywords: ["interdoors", "900682082"] },
  { carpeta: "InternacionalBelleza",  nombre: "INTERNACIONAL DE BELLEZA S.A.S.",                     nit: "811035695", cardCode: "C811035695", keywords: ["internacional de belleza", "811035695"] },
  { carpeta: "Kymia",                 nombre: "KYMIA S.A.S",                                         nit: "900811740", cardCode: "C900811740", keywords: ["kymia", "900811740"] },
  { carpeta: "LaboratoriosEcar",      nombre: "LABORATORIOS ECAR S.A",                               nit: "890902168", cardCode: "C890902168", keywords: ["laboratorios ecar", "ecar", "890902168"] },
  { carpeta: "LandersYCia",           nombre: "LANDERS Y CIA SAS",                                   nit: "890900098", cardCode: "C890900098", keywords: ["landers y cia", "landers", "890900098"] },
  { carpeta: "Macrolab",              nombre: "MACROLAB ASOCIADOS S.A.S.",                           nit: "890937996", cardCode: "C890937996", keywords: ["macrolab asociados", "macrolab", "890937996"] },
  { carpeta: "ManeAndina",            nombre: "MANE ANDINA S.A.S.",                                  nit: "901873427", cardCode: "C901873427", keywords: ["mane andina", "mane", "901873427"] },
  { carpeta: "McmCompany",            nombre: "MCM COMPANY S.A.S.",                                  nit: "890903436", cardCode: "C890903436", keywords: ["mcm company", "mcm", "comerxia", "890903436"] },
  { carpeta: "Placa",                 nombre: "PLASTICOS Y CAUCHOS S.A. PLACA",                      nit: "860533798", cardCode: "C860533798", keywords: ["plasticos y cauchos", "placa", "860533798"] },
  { carpeta: "Polikem",               nombre: "POLIKEM S.A.S.",                                      nit: "890928929", cardCode: "C890928929", keywords: ["polikem", "890928929"] },
  { carpeta: "Prodia",                nombre: "PRODIA S.A.S",                                        nit: "800171809", cardCode: "C800171809", keywords: ["prodia", "800171809"] },
  { carpeta: "NewStetic",             nombre: "PRODUCTORA Y COMERCIALIZADORA ODONTOLOGICA NEW STETIC S.A", nit: "890900267", cardCode: "C890900267", keywords: ["new stetic", "newstetic", "890900267"] },
  { carpeta: "Doria",                 nombre: "PRODUCTOS ALIMENTICIOS DORIA SAS",                    nit: "860017055", cardCode: "C860017055", keywords: ["productos alimenticios doria", "doria", "860017055"] },
  { carpeta: "Yupi",                  nombre: "PRODUCTOS YUPI SAS",                                  nit: "890315540", cardCode: "C890315540", keywords: ["productos yupi", "yupi", "890315540"] },
  { carpeta: "Proplas",               nombre: "PROPLAS S.A.",                                        nit: "890900427", cardCode: "C890900427", keywords: ["proplas", "890900427"] },
  { carpeta: "Rc2Pharma",             nombre: "RC2 PHARMACEUTICAL S.A.S.",                           nit: "900657137", cardCode: "C900657137", keywords: ["rc2 pharmaceutical", "rc2 pharma", "900657137"] },
  { carpeta: "SamaraCosmetics",       nombre: "SAMARA COSMETICS S.A.S.",                             nit: "900313153", cardCode: "C900313153", keywords: ["samara cosmetics", "samara", "900313153"] },
  { carpeta: "SelloGlobal",           nombre: "SELLO GLOBAL SAS",                                    nit: "901087786", cardCode: "C901087786", keywords: ["sello global", "901087786"] },
  { carpeta: "SetasColombianas",      nombre: "SETAS COLOMBIANAS S.A. SETAS S.A.",                   nit: "800151988", cardCode: "C800151988", keywords: ["setas colombianas", "setas", "800151988"] },
  { carpeta: "SolucionesInnovacion",  nombre: "SOLUCIONES E INNOVACION EN ALIMENTOS COLOMBIA S.A.S.", nit: "901314381", cardCode: "C901314381", keywords: ["soluciones e innovacion", "901314381"] },
  { carpeta: "SunChemical",           nombre: "SUN CHEMICAL COLOMBIA S.A.S.",                        nit: "890908649", cardCode: "C890908649", keywords: ["sun chemical", "890908649"] },
  { carpeta: "TramasLitografia",      nombre: "TRAMAS LITOGRAFIA SAS",                               nit: "900036588", cardCode: "C900036588", keywords: ["tramas litografia", "tramas", "900036588"] },
];

export function seedClientesFlexo(db: Database.Database): { inserted: number } {
  const existing = (db.prepare("SELECT COUNT(*) as c FROM clientes_aprobados").get() as { c: number }).c;
  if (existing > 0) return { inserted: 0 };

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO clientes_aprobados
      (carpeta, nombre, nit_principal, nits_json, keywords_json, card_code, prompt)
    VALUES
      (@carpeta, @nombre, @nit_principal, @nits_json, @keywords_json, @card_code, @prompt)
  `);

  let inserted = 0;
  const tx = db.transaction(() => {
    for (const c of CLIENTES_FLEXO) {
      const result = stmt.run({
        carpeta:       c.carpeta,
        nombre:        c.nombre,
        nit_principal: c.nit,
        nits_json:     JSON.stringify([c.nit]),
        keywords_json: JSON.stringify(c.keywords),
        card_code:     c.cardCode,
        prompt:        makePrompt(c.cardCode, c.nombre),
      });
      inserted += result.changes;
    }
  });
  tx();

  return { inserted };
}
