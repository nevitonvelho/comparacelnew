"use client";
import { parseImportLine, type ImportSource } from "@/lib/admin-import-model";
import { UiIcon } from "./icons";
export function AdminImportOpenLink({line,source}:{line:string;source:ImportSource}) {
  let href="";
  try {
    href=parseImportLine(line.replace(/\s+#.*$/,""),source).productUrl;
  }catch{return null;}
  return <a className="button secondary" href={href} target="_blank" rel="noopener noreferrer"><UiIcon name="external" />Abrir {source==="amazon"?"na Amazon":"no Mercado Livre"}</a>;
}
