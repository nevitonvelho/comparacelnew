import { Account } from "../components/account";
import { pageMetadata } from "@/lib/seo";
export const metadata = { ...pageMetadata("Minha conta", "Acesse seus favoritos e suas comparações salvas no Comparacel.", "/minha-conta"), robots: { index: false, follow: false } };
export default function Page() { return <Account />; }
