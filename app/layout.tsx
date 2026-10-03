import type { Metadata } from "next";
import { CatalogProvider } from "./components/catalog-provider";
import { Header, Footer, ComparisonBar } from "./components/site-shell";
import { AuthProvider } from "./components/auth-provider";
import { LibraryProvider } from "./components/library-provider";
import { ReactionProvider } from "./components/reaction-provider";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "ComparaCel — compare e escolha melhor", template: "%s | ComparaCel" },
  description: "Compare produtos, confira fichas técnicas e ofertas e escolha com mais clareza.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body><AuthProvider><LibraryProvider><ReactionProvider><CatalogProvider><a className="skip-link" href="#conteudo">Pular para o conteúdo</a><Header />{children}<Footer /><ComparisonBar /></CatalogProvider></ReactionProvider></LibraryProvider></AuthProvider></body></html>;
}
