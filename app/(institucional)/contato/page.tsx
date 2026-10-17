import Link from "next/link";
import { InstitutionalPage } from "@/app/components/institutional-page";
import { pageMetadata } from "@/lib/seo";
import { contactEmail } from "@/lib/institutional";

export const metadata = pageMetadata("Contato", "Fale com o Comparacel sobre o site, correções no catálogo, parcerias ou seus dados pessoais.", "/contato");

export default function Page() {
  return <InstitutionalPage path="/contato" title="Contato" description="Fale com o Comparacel sobre o site, correções no catálogo, parcerias ou seus dados pessoais.">

<section><h2>Fale com a equipe</h2>{contactEmail ? <><p>Envie sua mensagem para <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.</p><p><a className="button primary" href={`mailto:${contactEmail}`}>Enviar e-mail</a></p></> : <p>O endereço público de atendimento ainda não foi disponibilizado nesta página. Volte a consultar este espaço para verificar a atualização do canal.</p>}</section>
<section><h2>Correções e problemas no site</h2><p>Informe o endereço da página, o produto ou a comparação envolvida e descreva o que aconteceu. Para correções de especificações, inclua, se possível, um link do fabricante com a informação correta.</p></section>
<section><h2>Privacidade e dados pessoais</h2><p>Para solicitar acesso, correção ou exclusão de dados ou da conta, use o assunto “Privacidade” e informe o e-mail utilizado no Comparacel e o pedido que deseja fazer. Não envie senhas, números de cartão ou documentos sem que sejam necessários e solicitados para confirmar sua identidade.</p><p>Consulte a <Link href="/politica-de-privacidade">Política de privacidade</Link> para conhecer nossas práticas e seus direitos.</p></section>
<section><h2>Compras, entregas e garantias</h2><p>O Comparacel não vende nem entrega os produtos do catálogo. Para tratar de pedidos, cobranças, cancelamentos, trocas ou garantias, procure o atendimento da loja em que realizou a compra.</p></section>
<section><h2>Parcerias comerciais</h2><p>Para propostas de parceria ou publicidade, descreva a empresa, a proposta e um canal de retorno. Consulte também nossa página de <Link href="/transparencia">transparência e afiliados</Link>.</p></section>
  </InstitutionalPage>;
}
