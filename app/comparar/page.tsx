import { Comparison } from "../components/comparison";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata("Comparar produtos", "Escolha dois produtos e compare suas fichas técnicas, diferenças e ofertas lado a lado no Comparacel.", "/comparar");
export default function Page() { return <Comparison />; }
