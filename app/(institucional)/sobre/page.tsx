import Link from "next/link";
import { InstitutionalPage } from "@/app/components/institutional-page";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("Sobre o Comparacel", "Conheça nossa proposta e como ajudamos você a comparar produtos antes de comprar.", "/sobre");

export default function Page() {
  return <InstitutionalPage path="/sobre" title="Sobre o Comparacel" description="Conheça nossa proposta e como ajudamos você a comparar produtos antes de comprar.">

<section><h2>Compare antes de escolher</h2><p>O Comparacel reúne fichas técnicas, preços e ofertas para ajudar você a entender as diferenças entre produtos e decidir de acordo com suas necessidades e seu orçamento.</p><p>Você pode explorar o catálogo por categoria, consultar características de cada produto e colocar dois modelos lado a lado. Quando disponíveis, as páginas também apresentam ofertas de lojas e opiniões da comunidade.</p></section>
<section><h2>Como usar as informações</h2><p>As comparações utilizam as especificações cadastradas e os critérios técnicos disponíveis para cada categoria. Um destaque técnico não significa que um produto seja a melhor opção para todas as pessoas. Campos sem informação não devem ser interpretados como ausência de um recurso.</p><p>Preços, estoque, versões e condições comerciais podem mudar. Confira o modelo exato, a voltagem, a garantia, o frete e as condições de pagamento diretamente na loja antes de concluir a compra.</p></section>
<section><h2>Nosso papel na sua compra</h2><p>O Comparacel é uma plataforma de informação e comparação. A venda, a cobrança, a entrega, as trocas e a garantia são conduzidas pela loja e pelos responsáveis pelo produto. Não recebemos pagamentos por compras dos produtos apresentados no catálogo.</p></section>
<section><h2>Como o site se mantém</h2><p>Podemos receber comissões por compras realizadas por links de afiliados e receita de anúncios. Entenda essas relações em nossa página de <Link href="/transparencia">transparência e afiliados</Link>.</p></section>
<section><h2>Ajude a melhorar o catálogo</h2><p>Encontrou uma ficha desatualizada ou uma oferta com informações diferentes? Envie o link da página e a fonte da correção pelo nosso <Link href="/contato">canal de contato</Link>.</p></section>
  </InstitutionalPage>;
}
