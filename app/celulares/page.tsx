import { Catalog } from "../components/catalog";
import { pageMetadata } from "@/lib/seo";
import { JsonLd } from "../components/json-ld";
import { breadcrumbs } from "@/lib/seo";
export const metadata = pageMetadata("Celulares", "Compare celulares: preços, câmeras, bateria, desempenho e fichas técnicas no Comparacel.", "/celulares");
export default function Page() { return <main id="conteudo"><JsonLd data={breadcrumbs([{ name: "Início", path: "/" }, { name: "Celulares", path: "/celulares" }])} /><Catalog defaultCategory="celulares" /></main>; }
