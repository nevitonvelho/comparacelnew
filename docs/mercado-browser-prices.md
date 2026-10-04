# Consulta de preço do Mercado Livre com navegador

A consulta com navegador é executada pelo próprio Comparacel em Node.js. Não precisa de serviço Python. Configure a fonte explicitamente; sem a variável, a API continua sendo usada.

Para ativar:

```dotenv
ML_PRICE_SOURCE=browser
```

Na Vercel, Playwright usa o Chromium incluído na dependência `@sparticuz/chromium`. O `next.config.ts` inclui os arquivos do navegador no pacote da rota de atualização. Localmente, usa Chromium instalado com `npx playwright install chromium`. A primeira execução na Vercel precisa descompactar o navegador; não foi validado em um deploy real. O navegador consome mais memória que uma consulta HTTP e pode continuar recebendo bloqueios do Mercado Livre.

`ML_BROWSER_WS_ENDPOINT` é opcional, apenas para quem preferir um navegador remoto compatível com CDP. Configure variáveis apenas no servidor (sem NEXT_PUBLIC_).

## Cache de 24 horas

Consultas bem-sucedidas do Mercado Livre são registradas no Firestore, na coleção privada `adminMercadoPriceCache`. A chave identifica o link de compra exato, ID, tipo de anúncio e fonte (API ou navegador). Trocar qualquer desses dados não reutiliza o resultado antigo. Apenas preço, condição e data da consulta são armazenados; não salva HTML.

Enquanto o cache estiver válido, a atualização informa quando a próxima consulta estará disponível e mantém o valor cadastrado, inclusive alterações manuais. Não abre navegador, não altera a data de conferência nem duplica histórico. Após 24 horas, o próximo clique consulta a fonte novamente; não há agendamento automático. “Começar do zero” reinicia o lote, mas respeita o cache. Erros não são cacheados. Entradas expiradas são ignoradas e substituídas na próxima consulta bem-sucedida para a mesma chave.

A atualização prioriza a API. Com `ML_PRICE_SOURCE=browser`, se a API devolver a ficha sem preço, tenta uma navegação adicional no link de afiliado, verifica o ID e lê o preço principal da página do produto. Se a indicação de Pix aparecer junto ao preço, salva a condição e exibe “No Pix”. Não consulta outro vendedor quando o navegador falha. Não faz login nem resolve verificações de acesso.

São no máximo duas tentativas de coleta: uma pela API e uma pelo navegador quando necessário, ou duas pela API no modo `api`. Após falhas, o preço anterior permanece. O lote continua e a oferta pode ser consultada manualmente depois. Uma coleta pela API pode envolver mais de um endpoint para ficha e preço de venda.

Importações continuam usando a API para ficha e preço. Se um produto novo do Mercado Livre vier sem preço, a importação informa erro e não cria um produto vazio. É possível usar uma URL de anúncio específico (ID do vendedor via `wid`, `item_id` ou link direto de anúncio), ou cadastrar manualmente. Reimportações de produtos existentes preservam o preço anterior quando a fonte não informa um novo valor.

Se a fonte retornar HTTP 403/429 ou uma verificação de acesso, registra um intervalo de 15 minutos no Firestore (`adminPriceSourceStatus`, privado), separado por loja e modo de consulta. Durante esse intervalo, ofertas da mesma fonte são ignoradas sem abrir navegador ou fazer nova consulta; a outra loja continua normalmente. Isso é uma proteção temporária contra repetição de bloqueios, não um cache de preço. A Amazon usa a mesma proteção.

Limites internos da aplicação retornam 429 com tempo de espera explícito. O lote aguarda e tenta uma vez novamente quando a espera é de até dois minutos. Se o limite persistir ou o orçamento horário estiver esgotado, mantém a oferta pendente para continuar depois, sem registrá-la como falha da loja.

Teste o anúncio de uma lavadora antes de ativar para o lote. Preços podem variar conforme localização, sessão e condições de pagamento. Um link que leva apenas à vitrine social, sem identificar o produto, é rejeitado.
