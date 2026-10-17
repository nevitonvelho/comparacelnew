import Link from "next/link";
import { InstitutionalPage } from "@/app/components/institutional-page";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("Transparência e afiliados", "Entenda como funcionam as ofertas, os anúncios e os critérios apresentados nas comparações.", "/transparencia");

export default function Page() {
  return <InstitutionalPage path="/transparencia" title="Transparência e afiliados" description="Entenda como funcionam as ofertas, os anúncios e os critérios apresentados nas comparações.">

<section><h2>Links de afiliados</h2><p>Parte dos links de ofertas pode ser de afiliados. Se você acessar uma loja por esses links e realizar uma compra elegível, o Comparacel poderá receber uma comissão. Não cobramos de você uma taxa adicional por utilizar esses links.</p><p>A atribuição da compra e a comissão dependem das regras da loja ou da rede de afiliados. A identificação do clique pode envolver cookies e outras tecnologias do parceiro.</p></section>
<section><h2>Anúncios</h2><p>O site integra o Google AdSense e pode exibir anúncios fornecidos por terceiros. Espaços publicitários são distintos das informações de ficha técnica. A exibição de um anúncio não representa verificação, endosso ou garantia do anunciante ou do produto anunciado pelo Comparacel.</p><p>Consulte a <Link href="/politica-de-privacidade">Política de privacidade</Link> para entender a publicidade personalizada e suas opções de controle.</p></section>
<section><h2>Informações, critérios e limitações</h2><p>As fichas e comparações utilizam as informações cadastradas no catálogo. Os destaques técnicos seguem os critérios disponíveis para cada categoria. Eles não equivalem a testes de laboratório ou avaliações práticas, salvo quando uma página apresentar expressamente esse tipo de conteúdo e sua metodologia.</p><p>As notas, reações e opiniões da comunidade devem ser interpretadas conforme a origem indicada na interface. A ausência de dados não significa que um recurso inexista. Não presumimos que os itens cadastrados representem todas as opções do mercado.</p></section>
<section><h2>Preços e condições de compra</h2><p>As ofertas podem mudar entre a consulta no Comparacel e o acesso à loja. Preço, estoque, frete, parcelamento, descontos e condições de pagamento devem ser confirmados no destino. Valores condicionados a Pix, cupons ou outras condições precisam ser verificados antes de concluir a compra.</p></section>
<section><h2>Correções e dúvidas</h2><p>Para apontar informações incorretas ou esclarecer relações comerciais, use o <Link href="/contato">canal de contato</Link> e inclua o endereço da página e a informação que deseja revisar. Solicitações sobre pagamento, entrega e garantia de pedidos devem ser encaminhadas à loja responsável.</p></section>
  </InstitutionalPage>;
}
