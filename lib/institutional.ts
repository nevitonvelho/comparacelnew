export const institutionalPages = [
  { path: "/sobre", title: "Sobre o Comparacel" },
  { path: "/contato", title: "Contato" },
  { path: "/politica-de-privacidade", title: "Política de privacidade" },
  { path: "/politica-de-cookies", title: "Política de cookies" },
  { path: "/termos-de-uso", title: "Termos de uso" },
  { path: "/transparencia", title: "Transparência e afiliados" },
] as const;

// Contato público padrão; permite substituição por ambiente.
export const contactEmail = process.env.SITE_CONTACT_EMAIL?.trim() || "nevitonvelho01@gmail.com";
