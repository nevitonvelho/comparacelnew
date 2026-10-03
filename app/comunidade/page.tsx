import { Community } from "../components/community";
import { pageMetadata } from "@/lib/seo";
export const metadata=pageMetadata("Mais comparados", "Descubra os pares de produtos mais acessados nos últimos 7 dias e compare suas diferenças no Comparacel.", "/comunidade");
export default function Page(){return <Community />;}
