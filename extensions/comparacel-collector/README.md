# Extensão Comparacel

Chrome e Edge, Manifest V3. Importa o produto visível no Mercado Livre ou Amazon Brasil.

## Instalação

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ative o modo de desenvolvedor e clique em **Carregar sem compactação**.
3. Selecione esta pasta, que contém `manifest.json`.
4. No Comparacel, abra **Extensão → Gerar chave de conexão**.
5. Na extensão, abra **Conexão com o Comparacel**, informe o endereço do site e cole a chave.
6. Clique em **Conectar e carregar categorias**.

Pode usar `http://localhost:3000` durante o desenvolvimento ou o endereço HTTPS do site publicado. Para outros domínios, a extensão pede acesso somente ao endereço configurado.

## Uso

1. Abra a página de produto no Mercado Livre ou Amazon. Vitrines, páginas de busca e páginas de verificação não são produtos.
2. Clique no ícone da extensão. A página atual é coletada ao abrir o popup; **Coletar página aberta** permite repetir a coleta.
3. A extensão verifica se o anúncio já existe, pelo identificador da Amazon ou Mercado Livre. Se existir, mostra a ficha e os botões de atualização.
4. Para um produto novo, cole seu link de afiliado, escolha uma categoria e clique em **Importar produto novo**. Mantenha o popup aberto até aparecer o resultado.
5. Clique em **Abrir produto no painel** para revisar. Produtos novos ficam como rascunhos; produtos existentes mantêm publicação e campos manuais.

A extensão envia título, descrição, marca, preço, condição de pagamento quando identificada, URL da imagem principal e características visíveis. Não envia cookies, senha, HTML completo ou credenciais do Firebase. A imagem é baixada pelo servidor e enviada ao Storage; se esse download falhar, o produto é importado com aviso para enviar a imagem na edição. O preço coletado é enviado mesmo se o servidor não conseguir acessar a página do produto.

## Conexão

A chave é salva somente no armazenamento local da extensão. O servidor guarda seu hash, com validade de 30 dias, e verifica as permissões atuais da conta a cada operação. Gerar uma nova chave invalida a anterior; **Revogar conexão** a desativa imediatamente. A chave só permite carregar categorias, consultar produtos e importar/atualizar pela rota da extensão, não autentica as outras rotas do painel.

O painel não precisa ficar aberto depois da conexão. O servidor Comparacel precisa estar acessível. Na coleta individual, a extensão utiliza a página que você abriu. No lote, abre uma aba por anúncio após você iniciar. Não resolve verificações das lojas. Se os seletores de preço mudarem, a coleta informa erro em vez de enviar zero.

Uma coleta vale por 24 horas e passa por validação no servidor. Não há publicação automática nem execução periódica. A atualização em lote depende da tela da extensão aberta e do início manual.

## Ficha técnica e destaques

No Mercado Livre, a coleta tenta carregar a seção de características, lê tabelas tradicionais e novas tabelas `striped-specs`, pares de campos e propriedades estruturadas JSON-LD. O popup informa quantas características encontrou. Se nenhuma aparecer, abra/expanda as características do anúncio e colete novamente. Reimportar o mesmo produto acrescenta características ausentes e preserva valores editados no painel.

Quando os destaques estão vazios, o servidor pode gerar alguns pontos técnicos a partir de características explícitas, como NFC/5G informados ou ausência declarada de carregador. Não cria uma desvantagem quando a informação está ausente, nem substitui a análise editorial já cadastrada. Confira os destaques no painel antes de publicar.

## Atualizar e adicionar a outra loja

- **Atualizar apenas o preço** usa o preço e a condição de pagamento coletados. Mantém o link de afiliado, a ficha, a disponibilidade cadastrada e as outras ofertas. Não precisa colar o afiliado novamente.
- **Atualizar todas as informações** atualiza nome, marca, descrição, imagem e características encontradas, além da oferta da loja aberta. Características ausentes na coleta, publicação, notas, SEO, análise editorial e ofertas das outras lojas são mantidas. Se a imagem falhar, mantém a anterior e mostra um aviso.
- **Adicionar / atualizar oferta e link de afiliado** salva somente a oferta da loja aberta, sem alterar a ficha técnica. Em anúncios já vinculados, deixar o afiliado vazio mantém o link cadastrado.

Se o produto já foi importado da Amazon e agora você está na página dele no Mercado Livre (ou o inverso), use **Buscar produto** pelo modelo, parte do nome, URL pública `/produto/...` ou link de edição do painel. Selecione a mesma ficha, confira a versão/capacidade, cole o afiliado da loja aberta e clique em **Adicionar / atualizar oferta e link de afiliado**. A oferta original permanece e o produto passa a ter as duas opções de compra. Nas próximas visitas ao mesmo anúncio, a extensão reconhece essa ficha automaticamente.

A seleção entre lojas é explícita: títulos diferentes ou produtos com nomes parecidos não são unidos automaticamente. Cada ficha aceita uma oferta por loja; salvar outro anúncio da mesma loja substitui aquela oferta.

Após atualizar a extensão, clique em **Recarregar** em `chrome://extensions`. Se instalou pelo ZIP do painel, baixe a nova versão e carregue a pasta descompactada.

## Identificação automática (1.1.1)

Ao abrir a extensão, ela verifica o identificador do anúncio. Se ainda não estiver vinculado, busca automaticamente fichas com nome/modelo semelhante e mostra as sugestões, com a primeira selecionada. Você não precisa digitar o nome a cada visita. Confira o produto sugerido e clique na ação desejada; o vínculo só é salvo ao adicionar/atualizar a oferta. Diferenças explícitas de modelo, capacidade ou tensão excluem a sugestão. A busca manual fica recolhida em **Não encontrou? Buscar outro produto**, já preenchida com o título coletado.

### Precisão e compatibilidade (1.1.2)

O código de modelo (como ME23B) tem prioridade sobre textos extras do anúncio. A tensão ausente no título de uma loja não impede a sugestão; tensões ou capacidades explicitamente diferentes continuam sendo excluídas na API atual. Se o site conectado ainda não retorna sugestões automáticas, a extensão faz a busca pelo modelo na API anterior, sem exigir digitação. Os resultados dessa compatibilidade também são apresentados como possíveis correspondências para conferir antes de salvar.

### Busca manual (1.1.3)

A busca aceita títulos copiados com aspas, diferenças de ordem/pontuação e nomes abreviados de modelos. Para TVs Samsung, reconhece códigos completos como UN55U8100FGXZD e a família U8100F, preservando a distinção de tamanho. Mostra a quantidade de resultados junto ao campo e seleciona a primeira ficha encontrada, para você conferir antes de salvar a oferta. Em sites com a busca anterior, tenta novamente pelo modelo quando o título completo não retorna resultados.

### Rascunho preservado (1.1.4)

Ao fechar e reabrir o popup no mesmo anúncio, a extensão restaura a coleta, o título digitado na busca, o link de afiliado, a categoria e o produto selecionado. Pode sair para copiar informações e voltar sem preencher tudo novamente. O rascunho fica separado por aba e anúncio, com validade de sete dias. O botão **Coletar página aberta** inicia uma nova coleta.

### Oferta indisponível (1.1.5)

Nos anúncios já vinculados, use **Marcar oferta como indisponível**. Funciona também quando a página não apresenta preço. Mantém o link de afiliado e o último preço, altera apenas a disponibilidade daquela loja e preserva as demais ofertas. No painel, o link fica esmaecido e identificado como **Indisponível**. Quando a oferta voltar, colete novamente e use **Atualizar apenas o preço** para reativá-la.

### Diagnóstico de API anterior (1.1.6)

Se o servidor conectado ainda recusar a ação de indisponibilidade, a mensagem identifica o endereço que precisa receber a atualização. Atualizar apenas a extensão não atualiza a API do site publicado. Os campos permanecem preenchidos após o erro.

### Atualizar preço de produto selecionado (1.1.8)

O botão **Atualizar apenas o preço** também aparece para fichas sugeridas ou selecionadas na busca manual. Se a ficha ainda não possui oferta desta loja, informe o afiliado: a ação adiciona/atualiza sua oferta, sem substituir nome, imagem, descrição ou ficha técnica. Confira se a sugestão corresponde ao mesmo modelo e versão. Se já existe oferta desta loja, a atualização de preço mantém seu afiliado salvo, mesmo quando o identificador do anúncio aberto mudou. Não é necessário preencher o link novamente.

### Oferta indisponível em ficha selecionada (1.1.9)

O botão de indisponibilidade também aparece para fichas sugeridas ou selecionadas na busca quando já possuem uma oferta da loja aberta. Confira modelo e versão antes de marcar. A ação preserva o link, o último preço e as ofertas das outras lojas; não exige preço na página.

### Conferência por variante (1.1.10)

As sugestões diferenciam cores quando ambas as fichas informam a cor. A mensagem de sucesso identifica o nome completo da ficha atualizada. Conferir uma variante não marca outra variante como conferida.


## Atualizar preços em lote (1.2.0)

1. Conecte a extensão e clique em **Atualizar preços em lote**. Uma tela própria fica aberta mesmo depois de fechar o popup.
2. Clique em **Carregar todas as ofertas**. Não há filtro por data nem limite de quantidade na fila; inclui ofertas conferidas hoje e sem data; links sem identificador de anúncio ficam para conferência manual. Inclui rascunhos e ofertas indisponíveis para permitir reativação quando houver preço válido.
3. Clique em **Iniciar atualização** e permita o acesso à Amazon e ao Mercado Livre quando o navegador pedir. O lote abre uma aba de coleta por vez, salva apenas o preço/condição, preserva o afiliado e avança com intervalo entre anúncios.
4. Use **Pausar** e **Continuar atualização** quando necessário. Se aparecer uma verificação da loja, o lote pausa e abre a aba correspondente; resolva nela antes de continuar. Pode também deixar esse anúncio para revisão e continuar a fila.
5. Confira o progresso e as pendências. Anúncios identificados sem preço são marcados como indisponíveis após três leituras rápidas. O último preço e o afiliado são preservados. Erros de navegação, verificações de acesso e anúncios diferentes não alteram a disponibilidade. Uma coleta válida reativa a oferta.

O servidor confirma o produto, a loja, o identificador do anúncio e o link cadastrado antes de salvar. Um redirecionamento para outro anúncio ou uma oferta alterada após carregar a fila exige revisão. O lote mantém o limite existente de 200 operações por hora; ao atingir o limite, pausa. Fechar a tela ou o navegador interrompe a execução; reabrir recupera o último progresso salvo, sem iniciar sozinho. Apenas um lote executa por vez. A chave de conexão precisa continuar válida e o servidor e a extensão precisam estar atualizados.

### Lote mais rápido (1.2.1)

A página tem até 20 segundos para carregar. Depois de carregada, o lote tenta ler o preço três vezes, com intervalo de 1,5 segundo. Se houver título do produto e faltar preço, marca somente aquela oferta como indisponível. As gravações respeitam o intervalo mínimo do servidor (4,1 segundos), sem esperar cinco segundos adicionais entre anúncios.

### Todas as ofertas (1.2.2)

A fila inclui todas as ofertas identificadas da Amazon e Mercado Livre, independentemente da última conferência. Não limita a quantidade de produtos; mantém o limite de gravações por hora da API. Para repetir um lote concluído ou expandir um lote antigo, clique em **Carregar todas as ofertas**.
