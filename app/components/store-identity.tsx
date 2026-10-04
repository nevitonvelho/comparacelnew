import Image from "next/image";

const logos: Record<string, string> = {
  mercadolivre: "mercadolivre",
  amazon: "amazon",
  amazonbrasil: "amazon",
  amazoncombr: "amazon",
  shopee: "shopee",
};

export function StoreIdentity({ name }: { name: string }) {
  const key = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const logo = logos[key];
  return <span className="store-identity">{logo && <span className={`store-logo store-logo-${logo}`}><Image src={`/brand/stores/${logo}.svg`} width={32} height={32} alt="" /></span>}<span>{name}</span></span>;
}
