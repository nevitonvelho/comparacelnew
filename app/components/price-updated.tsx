export function PriceUpdated({ dates, kind = "price" }: { dates: (string | undefined)[]; kind?: "price" | "product" }) {
  const date=dates.filter((value):value is string=>!!value && Number.isFinite(Date.parse(value))).sort().at(-1);
  return <small className="price-updated">{date ? <>{kind === "product" ? "Produto atualizado em " : "Preço atualizado em "}<time dateTime={date}>{new Date(date).toLocaleString("pt-BR",{timeZone:"America/Bahia",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}</time></> : kind === "product" ? "Atualização do produto não registrada" : "Atualização de preço não registrada"}</small>;
}
