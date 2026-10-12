# CRO e conversão — Comparacel

## Diagnóstico e escopo

A análise encontrou catálogo e busca no componente `Catalog`, cards compartilhados entre home, categorias e marcas, detalhes em `/produto/[slug]`, e comparação em `/comparar` e `/comparar/[slug]`. As páginas têm renderização inicial, canonical, metadados e JSON-LD. Essas estruturas foram preservadas.

As principais barreiras eram a ausência de acesso direto à loja nos cards, a comparação como ação principal no detalhe, ofertas distantes da decisão, CTA genérico “Ir à loja” e ausência de eventos comerciais no GTM existente.

## Mudanças e hipóteses

- CTA direto por loja nos cards: reduz o caminho até o anúncio; ficha e comparação continuam acessíveis.
- Oferta com menor preço cadastrado no topo do detalhe e na visão geral da comparação: aproxima a ação da decisão.
- Ofertas ordenadas, identidade da loja, datas individuais e diferenças em reais: facilitam comparar condições e preço.
- Vantagens e limitações cadastradas, orientação de uso, FAQ e alternativas: ajudam a resolver dúvidas sem inventar recomendações editoriais.
- Histórico de preços logo abaixo da foto: permite consultar a evolução do preço junto à apresentação do produto, conforme a preferência do usuário.
- Barra mobile com espaço reservado no fim da página: facilita voltar à oferta; é ocultada quando há uma barra de comparação.
- Aviso de afiliados e confirmação de preço, frete e pagamento: tornam o destino e o papel do Comparacel claros.
- A imagem principal do detalhe carrega com `loading="eager"` e `fetchPriority="high"`; imagens dos cards continuam lazy. Não foram adicionadas bibliotecas ou chamadas de rede para rastreamento.

As ofertas comparadas são disponíveis e têm URL cadastrada. Preços desconhecidos ficam por último; ofertas sem preço não recebem selo. “Menor preço” refere-se somente ao catálogo e não ao mercado inteiro. Pix permanece identificado. Não há dados de parcelamento no modelo atual. Não foi criada uma nota geral de custo-benefício.

## Rastreamento e configuração externa

O código publica estes eventos no `window.dataLayer` do GTM existente:

| Evento | Momento | Parâmetros |
| --- | --- | --- |
| `affiliate_click` | Clique principal, teclado ou botão central em link de oferta | `product_id`, `product_name`, `merchant`, `page_type`, `button_position`, `offer_id` |
| `offer_view` | Pelo menos 10% de um CTA fica visível | Os mesmos parâmetros da oferta |
| `product_view` | Detalhe do produto renderizado | `product_id`, `product_name`, `page_type` |
| `comparison_view` | Comparação renderizada | `comparison_id`, `page_type` |

Um único listener delegado registra cliques, sem bloquear a navegação nem reescrever URLs. Um observador compartilhado registra ofertas visíveis. Impressões são deduplicadas por produto/oferta durante a visita à rota, mesmo quando o CTA aparece em vários locais. Ao voltar à rota, começa uma nova visita; cada clique deliberado é contabilizado. Campos ausentes são enviados como `null` para não herdar valores do evento anterior. Não enviamos URL da oferta, consulta de busca, e-mail, UID ou dados de conta.

A publicação no dataLayer **não envia os eventos automaticamente ao GA4**. No container GTM:

1. Reutilizar a Google tag/GA4 existente; não instalar outra configuração de GA4.
2. Criar variáveis de camada de dados para os sete parâmetros acima e `comparison_id`.
3. Criar um acionador de evento personalizado com regex `^(affiliate_click|product_view|offer_view|comparison_view)$`.
4. Criar uma tag de evento GA4 com nome `{{Event}}`, parâmetros mapeados às variáveis, e esse acionador. Manter as regras de consentimento existentes.
5. Evitar outra tag genérica que envie o mesmo `affiliate_click` por “Just Links”. Os cliques automáticos de saída podem continuar como `click`, um evento separado.
6. Conferir no Preview/Tag Assistant e no DebugView do GA4: um clique deve produzir um `affiliate_click`; a mesma oferta em hero/lista/barra deve produzir uma impressão por visita.
7. Publicar o container. Para relatórios, registrar as dimensões personalizadas necessárias. `offer_id` e `product_id` podem ter alta cardinalidade; avaliar uso em exploração ou exportação.

Referências oficiais: [camada de dados](https://developers.google.com/tag-platform/tag-manager/datalayer) e [eventos GA4 no GTM](https://support.google.com/tagmanager/answer/13034206).

## Próximos testes A/B

- CTA específico da loja versus “Ver oferta”: CTR por posição e dispositivo.
- Card com acesso direto à loja versus acesso somente à ficha: cliques qualificados e conversões nos relatórios de afiliados.
- Barra mobile ativada versus desativada: CTR, interação com comparação e rejeição.
- Uma oferta principal versus destaque para comparar todas as lojas: CTR e distribuição dos cliques entre lojas.

Medir cliques por visita ao produto e por impressão de oferta. Ao deduplicar impressões entre posições, o denominador por posição corresponde à primeira exposição; não tratar como impressões independentes de cada CTA. Atribuição de vendas/comissões depende dos relatórios dos parceiros. Nenhum aumento de CTR ou de Core Web Vitals foi comprovado antes de medir tráfego real.

## Arquivos alterados ou criados

- `app/components/affiliate-link.tsx`: link de afiliado reutilizável e aviso de transparência.
- `app/components/catalog.tsx`: identificação do contexto de busca sem enviar o termo pesquisado.
- `app/components/comparison-board.tsx`: CTAs, comparação de lojas e orientação de escolha.
- `app/components/conversion-tracking.tsx`: listener de cliques, observador compartilhado e deduplicação por visita, inclusive em Strict Mode.
- `app/components/product-card.tsx`: destaques, loja, data do preço e CTA direto.
- `app/components/product-detail.tsx`: hierarquia de compra, ofertas, orientação, histórico, FAQ e barra mobile.
- `app/components/product-image.tsx`: prioridade de carregamento da imagem principal.
- `app/components/site-shell.tsx`: transparência no rodapé.
- `app/globals.css`: apresentação e comportamento responsivo, contraste dos CTAs e correção do cabeçalho em 320 px.
- `app/layout.tsx`: integração do rastreamento compartilhado.
- `lib/conversion-events.ts`: parâmetros permitidos e classificação da página.
- `lib/product-offers.ts`: apresentação das ofertas e textos por loja, sem reescrever URLs.
- `tests/conversion-events.test.mjs`: proteção contra dados pessoais, limpeza de campos e contexto de busca.
- `tests/conversion.spec.ts`: cliques, impressões, navegação, barra mobile e larguras de 320 a 1440 px.
- `tests/product-offers.test.mjs`: ofertas indisponíveis, preços desconhecidos, empates e preservação de links.
- `tests/seo.spec.ts`: seletor de navegação específico para distinguir menu principal e rodapé.
- `docs/cro-implementation.md`: diagnóstico, hipóteses, integração GTM e próximos testes A/B.

## Validação executada

- `npm run test`: 19 arquivos de teste aprovados, nenhuma falha.
- `npm run lint`: aprovado.
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado com Turbopack e geração das páginas de produção. Foi necessário regenerar o cache após uma falha de permissão de porta no sandbox.
- Conversão e SEO no build final de produção: 7/7 testes aprovados; produto e comparação verificados em 320, 390, 768 e 1440 px. Os testes de conversão também verificam ausência de erros JavaScript.
- Teste administrativo de bloqueio de visitantes: aprovado na repetição em produção.
- Suíte completa inicial de interface: 13/21 aprovados, 8 falhas. Uma foi um timeout de compilação da rota de upload em desenvolvimento, resolvido na repetição em produção. As outras sete são testes de navegação com premissas anteriores ao estado atual do projeto: seletor `<select>` “Produto 1” substituído pelo seletor visual, quantidade fixa de 245 produtos (o catálogo tinha 367 na execução), e seleção de cards globais da home em categorias incompatíveis. O código de seleção e as regras de compatibilidade não foram alterados. Esses testes antigos não foram reescritos nesta entrega.
- Os testes específicos de emulador Firestore não foram executados: nenhuma regra de segurança, integração de banco ou lógica de gravação foi modificada.

O contraste do CTA principal branco sobre `#0061e8` é aproximadamente 5,42:1. A validação não constitui uma medição de Core Web Vitals em tráfego real; comparar LCP, INP e CLS após a publicação.

## Ajuste dos cards da home

Os cards da home usam a variante compacta: imagem menor, nome, preço, loja, CTA de oferta e ações discretas de ficha/comparação. Marca repetida, contador de especificações, textos de vantagens, data detalhada e contadores de reações foram retirados dessa variante. As informações completas continuam nas páginas dos produtos. Favorito, índice e identificação da categoria permanecem disponíveis.

## Produtos elegíveis na home

Todas as vitrines da home — destaques, últimas atualizações e grade de produtos — exibem apenas produtos com pelo menos uma oferta marcada como disponível e com link de compra não vazio. A mesma regra vale para as imagens representativas e contagens nas categorias da home. Um preço desconhecido não exclui uma oferta que tenha link ativo. Catálogo, páginas de categorias, detalhes e comparação continuam acessíveis com seus produtos cadastrados.

## Consistência dos cards nas listagens

Categorias, catálogo e marcas também usam os cards compactos. O conteúdo do card usa linhas próprias para nome, preço, oferta e ações, mantendo os botões alinhados entre produtos com títulos de tamanhos diferentes. A ficha técnica, os destaques e as datas detalhadas continuam na página do produto.

## Cards sem oferta ativa

Nas listagens fora da home, produtos sem link de compra disponível exibem “Sem oferta ativa”, uma explicação curta e o botão “Conhecer o produto” no espaço do CTA. O rodapé do card compacto mostra a quantidade de especificações e mantém a comparação, sem repetir o botão de detalhes. O acesso à ficha é um link interno e não gera evento de clique de afiliado. Esses produtos continuam excluídos das vitrines da home.

## Nova identidade visual

Logo fornecida aplicada no cabeçalho, rodapé, metadados e dados estruturados. Asset WebP com margens vazias removidas e 23 KB; original preservado. Favicon e ícone Apple derivados do símbolo original. Azul `#0061e8` nas ações e navegação; verde nos destaques de ofertas. Tokens CSS centralizam a paleta. Cores de lojas e indicadores de atenção permanecem sem alterações intencionais.

Validação da identidade: 19 testes unitários aprovados, ESLint e TypeScript sem erros, build de produção concluído. Conferência em navegador nas larguras 390 e 1440 px, sem overflow horizontal.
