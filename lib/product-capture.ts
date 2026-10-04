import { AdminError } from "./admin-model";
import { inferImportSpec, inferImportHighlights, parseImportLine, type CollectedProduct } from "./admin-import-model";

export type ProductCapture = {
  version: 1; source: "mercadolivre" | "amazon"; pageUrl: string; capturedAt: string;
  name: string; brand: string; description: string; imageUrl: string;
  price: number | null; condition: "pix" | "standard";
  specs: {name: string; value: string}[];
};

export function validateProductCapture(value: unknown, now = Date.now(), allowMissingPrice = false): ProductCapture {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdminError("Coleta inválida.");
  const data = value as Record<string, unknown>;
  for (const [field, maximum] of [["name",300],["brand",120],["description",50000],["imageUrl",2000],["pageUrl",4500],["capturedAt",40]] as const) {
    if (typeof data[field] !== "string" || (data[field] as string).length > maximum) throw new AdminError(`Campo inválido na coleta: ${field}.`);
  }
  if (data.version !== 1 || !["mercadolivre","amazon"].includes(String(data.source)) || !(data.name as string).trim()
    || (!(allowMissingPrice && data.price === null) && (typeof data.price !== "number" || !Number.isFinite(data.price) || data.price <= 0 || data.price > 100000000))
    || !["pix","standard"].includes(String(data.condition))) throw new AdminError("A coleta precisa conter o produto e um preço válido.");
  const date = Date.parse(data.capturedAt as string);
  if (!Number.isFinite(date) || date > now + 60000 || now-date > 86400000) throw new AdminError("A coleta expirou. Abra o produto e colete novamente (validade de 24 horas).");
  const source=data.source as "mercadolivre"|"amazon";
  const entry = parseImportLine(data.pageUrl as string, source);
  if (!entry.externalId) throw new AdminError("A coleta precisa vir da página do produto, não de um link curto ou vitrine.");
  if (!Array.isArray(data.specs) || data.specs.length > 200 || !data.specs.every(spec => spec && typeof spec.name === "string" && spec.name.length > 0 && spec.name.length <= 200 && typeof spec.value === "string" && spec.value.length > 0 && spec.value.length <= 2000)) throw new AdminError("Características inválidas na coleta.");
  // Build a clean payload; never forward unknown fields from the extension/file.
  return {version:1,source,pageUrl:data.pageUrl as string,capturedAt:data.capturedAt as string,name:(data.name as string).trim(),brand:(data.brand as string).trim() || "Genérico",description:data.description as string,imageUrl:data.imageUrl as string,price:data.price as number | null,condition:data.condition as "pix"|"standard",specs:data.specs.map(spec=>({name:spec.name,value:spec.value}))};
}

export function collectedFromProductCapture(capture: ProductCapture, line: string): CollectedProduct {
  const actual = parseImportLine(capture.pageUrl,capture.source);
  const expected = parseImportLine(line,capture.source);
  if (expected.externalId && (expected.externalId !== actual.externalId || (expected.kind ?? "catalog") !== (actual.kind ?? "catalog"))) throw new AdminError("A página coletada é de outro produto/anúncio. Confira o link de afiliado e o ID antes de importar.");
  const specs=capture.specs.map((spec,index)=>inferImportSpec(spec.name,spec.value,"Especificações",index));
  return {name:capture.name,brand:capture.brand,description:capture.description,imageUrl:capture.imageUrl,price:capture.price,priceCondition:capture.condition,externalId:actual.kind === "item" ? `item-${actual.externalId}` : actual.externalId,buyUrl:expected.buyUrl,specs,highlights:inferImportHighlights(specs)};
}
