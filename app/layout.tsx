import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { GoogleTagManager } from "./components/google-tag-manager";
import { getServerProducts } from "@/lib/server-catalog";
import { absoluteUrl, pageMetadata, siteUrl, siteName } from "@/lib/seo";
import { JsonLd } from "./components/json-ld";
import { CatalogProvider } from "./components/catalog-provider";
import { Header, Footer, ComparisonBar } from "./components/site-shell";
import { AuthProvider } from "./components/auth-provider";
import { LibraryProvider } from "./components/library-provider";
import { ReactionProvider } from "./components/reaction-provider";
import "./globals.css";
export const dynamic = "force-dynamic";
const gtmId = process.env.NEXT_PUBLIC_GTM_ID || "GTM-PN53J4BW";
export const metadata: Metadata = {
  ...pageMetadata("Compare produtos e escolha melhor", "Compare produtos, confira fichas técnicas e ofertas e escolha com mais clareza.", "/"),
  metadataBase: new URL(siteUrl),
  title: { default: "Comparacel — compare e escolha melhor", template: "%s | Comparacel" },
  robots: { index: true, follow: true },
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
};
export const viewport: Viewport = { themeColor: "#ff6420" };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const products = await getServerProducts();
  // Extensions may insert attributes on body before React hydrates it.
  // Suppression is limited to this element; child components retain diagnostics.
  return <html lang="pt-BR"><body suppressHydrationWarning>
    {/^GTM-[A-Z0-9]+$/.test(gtmId) && <noscript><iframe src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`} height="0" width="0" style={{ display: "none", visibility: "hidden" }} title="Google Tag Manager" /></noscript>}
    <Suspense fallback={null}><GoogleTagManager /></Suspense>
    <JsonLd data={{ "@context": "https://schema.org", "@type": "Organization", name: siteName, url: siteUrl, logo: absoluteUrl("/brand/comparacel.png") }} />
    <AuthProvider><LibraryProvider><ReactionProvider><CatalogProvider initialProducts={products}><a className="skip-link" href="#conteudo">Pular para o conteúdo</a><Header />{children}<Footer /><ComparisonBar /></CatalogProvider></ReactionProvider></LibraryProvider></AuthProvider>
  </body></html>;
}
