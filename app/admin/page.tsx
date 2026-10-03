import { AdminPanel } from "../components/admin-panel";
import { pageMetadata } from "@/lib/seo";
export const metadata = { ...pageMetadata("Administração", "Painel administrativo do Comparacel.", "/admin"), robots: { index: false, follow: false } };
export default function Page() { return <AdminPanel />; }
