export type Spec = {
  key: string; slug: string; name: string; group: string; order: number;
  display: string; number: number | null; higherIsBetter: boolean | null;
};
export type Offer = { id: string; store: string; url: string | null; price: number | null; available: boolean };
export type Product = {
  id: string; name: string; brand: string; category: string; score: string;
  price: number | null; imageUrl: string | null; label: string; specs: Spec[];
  description?: string; metaTitle?: string; metaDescription?: string;
  offers: Offer[]; highlights: { kind: string; text: string }[];
};
export const categoryNames: Record<string, string> = {
  celulares: "Celulares", notebooks: "Notebooks", televisoes: "Televisões",
  geladeiras: "Geladeiras", "ar-condicionado": "Ar-condicionado", "maquinas-de-lavar": "Máquinas de lavar",
  fogoes: "Fogões", "micro-ondas": "Micro-ondas", "fones-de-ouvido": "Fones de ouvido",
  "aspirador-de-po": "Aspiradores de pó", cafeteiras: "Cafeteiras",
};
export const money = (price: number) => price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function comparisonSlug(ids: string[]) { return [...ids].sort().join("-vs-"); }
export function selectProduct(current: string[], product: Product, products: Product[]): { ids: string[]; error: string | null } {
  if (current.includes(product.id)) return { ids: current.filter(id => id !== product.id), error: null };
  if (current.length >= 2) return { ids: current, error: "Você já escolheu dois produtos. Remova um para trocar." };
  const first = products.find(item => item.id === current[0]);
  if (first && first.category !== product.category) return { ids: current, error: "Escolha dois produtos da mesma categoria para comparar." };
  return { ids: [...current, product.id], error: null };
}
export function comparisonRows(a: Product, b: Product) {
  const keys = new Map([...a.specs, ...b.specs].map(spec => [spec.key, spec]));
  return [...keys.values()].sort((x, y) => x.group.localeCompare(y.group, "pt-BR") || x.order - y.order || x.name.localeCompare(y.name, "pt-BR")).map(spec => {
    const left = a.specs.find(item => item.key === spec.key);
    const right = b.specs.find(item => item.key === spec.key);
    let winner: "a" | "b" | null = null;
    if (left?.number != null && right?.number != null && left.higherIsBetter !== null && left.higherIsBetter === right.higherIsBetter && left.number !== right.number) {
      winner = (left.number > right.number) === left.higherIsBetter ? "a" : "b";
    }
    return { ...spec, a: left?.display ?? "—", b: right?.display ?? "—", winner };
  });
}

// Only reorganize generic imported groups; keep explicitly authored groups intact.
export function comparisonSection(spec: Pick<Spec, "group" | "slug">): string {
  if (!/^especifica[çc][õo]es$/i.test(spec.group)) return spec.group;
  const slug = spec.slug;
  if (/camera|camara|fotograf|sensor.*(frontal|traseiro)|filmagem|video-grav/.test(slug)) return "Câmeras";
  if (/bateria|carreg|energia|voltagem|tensao|consumo|potencia-eletrica/.test(slug)) return "Bateria e energia";
  if (/tela|ecra|resolucao|pixel|exibicao|brilho|atualizacao/.test(slug)) return "Tela e imagem";
  if (/processador|cpu|memoria|armazenamento|ram|gpu|chipset|disco/.test(slug)) return "Desempenho e armazenamento";
  if (/conect|wi-fi|wifi|bluetooth|sim|rede|celular|usb|porta|nfc|conector/.test(slug)) return "Conectividade";
  if (/sistema-operacional|software|aplicativo/.test(slug)) return "Software";
  if (/dimens|peso|cor$|material|altura|largura|profundidade|fator-de-forma/.test(slug)) return "Design e dimensões";
  if (/capacidade|funcao|programa|velocidade|temperatura|pressao|aquec|refrig|filtro/.test(slug)) return "Recursos e funções";
  return "Outras especificações";
}
