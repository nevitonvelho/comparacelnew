# ComparaCel

Next.js com catálogo, filtro por marca, busca e comparação de fichas técnicas. Sem blog.

## Desenvolvimento

```sh
npm install
cp .env.example .env.local
npm run dev
```

A configuração pública do projeto `comparacel` já está em `.env.example`.
O catálogo lê apenas produtos ativos do Firestore, em páginas de 100 registros.
Não usa produtos fictícios quando o banco está vazio ou indisponível.
Analytics está desativado por padrão; a inicialização opcional só ocorre no navegador
quando `NEXT_PUBLIC_FIREBASE_ANALYTICS_ENABLED=true`.

## Firebase

Crie o Cloud Firestore no console do projeto `comparacel`, se ainda não existir.
As regras permitem leitura pública dos produtos ativos e bloqueiam escrita pelo navegador.
As outras coleções são acessíveis apenas ao servidor via Admin SDK.
Para publicar as regras, com a Firebase CLI instalada e autenticada:

```sh
firebase deploy --only firestore --project comparacel
```

Este comando publica regras; não publica o site. O painel administrativo está em `/admin` e usa APIs protegidas no servidor.

## Migração do Django

A exportação preserva produtos, atributos dinâmicos, notas, destaques, ofertas,
histórico, marcas, categorias, lojas e comparações. Não inclui blog, usuários ou senhas.
O Django permanece intacto. Os arquivos em `data/` não entram no Git.

```sh
/home/neviton/code/comparacel/venv/bin/python -B scripts/export-django.py
node scripts/import-firestore.mjs
```

A simulação gera `data/firestore-import.json`, sem gravar no Firebase.
Os preços resumidos são armazenados em centavos. Os campos originais e as relações
por IDs antigos são preservados, e as fichas completas ficam dentro de cada produto.
A interface atual mostra apenas um resumo das especificações.

Para importar, configure `GOOGLE_APPLICATION_CREDENTIALS` com o caminho de uma
credencial administrativa local e execute:

```sh
node scripts/import-firestore.mjs data/django-export.json --write
```

A importação usa IDs estáveis e cria documentos sem sobrescrever documentos existentes.
Se falhar parcialmente, pode ser executada novamente; os já existentes são ignorados.
Imagens preservam o caminho original em `imagePath` e são migradas ao Storage pelo script abaixo.
Links de ofertas originais são preservados; as tags de afiliado configuradas no Django
não são aplicadas por este importador.

## Validação

```sh
npm run lint
npx tsc --noEmit
npx next build --webpack
```

## Imagens

As 245 imagens originais foram migradas ao bucket `comparacel.firebasestorage.app`.
Cada produto contém `imageUrl` e `imageStoragePath`; os cards e as fichas técnicas
carregam a foto pelo `next/image`, com proporção preservada, carregamento sob demanda
e indicação de imagem indisponível em caso de falha.

```sh
node scripts/migrate-images.mjs
# Com GOOGLE_APPLICATION_CREDENTIALS configurada:
node scripts/migrate-images.mjs --upload
```

A primeira etapa baixa e valida as imagens públicas do Django em `data/media/`.
A segunda envia os arquivos sem sobrescrever objetos existentes e atualiza apenas
os campos de imagem no Firestore. O relatório local fica em `data/images-manifest.json`.
Arquivos e relatório ficam fora do Git. URLs de download permitem acesso às fotos
sem autenticação. `storage.rules` contém regras para leitura pública somente em
`products/`, com escrita pelo navegador bloqueada; o arquivo ainda precisa ser
publicado caso essa forma de acesso ao Storage seja utilizada.

## Navegação e comparações

- `/`: home com a identidade da logo, acesso às 11 categorias e destaques de produtos de categorias variadas.
- `/celulares`: catálogo filtrado para celulares.
- `/catalogo`: todas as categorias, com busca, filtros e ordenação.
- `/produto/[slug]`: imagens, ofertas, pontos positivos e ficha técnica completa.
- `/comparar`: seleção de dois produtos da mesma categoria.
- `/comparar/[produto-a]-vs-[produto-b]`: comparação compartilhável das fichas cadastradas.

A seleção é preservada em `sessionStorage` durante a navegação. O terceiro produto
não substitui os anteriores silenciosamente. As tabelas usam a união das especificações
dos dois produtos; informações ausentes aparecem como “—”. Destaques numéricos
só usam critérios `higherIsBetter` cadastrados e compatíveis nos dois produtos.
Não são inferidos vencedores a partir de campos sem critério ou dados ausentes.

A logo original é usada em `public/brand/comparacel.png`, sem alterar o arquivo.

```sh
npm test
# Com o servidor em localhost:3000 e conexão ao Firebase:
npm run test:e2e
```

Os testes de navegador consultam o catálogo real sem escrever no Firebase.
Verificam troca de seleção, comparação, navegação, persistência na sessão,
filtros por categoria e largura da página em uma tela de 390px.

## Comparador por seções

O comparador segue a estrutura da referência fornecida do Kimovil, usando a
identidade do ComparaCel: colunas alinhadas para as fotos, preços, notas, destaques
e especificações; menu de seções; identificação dos produtos fixa durante a
rolagem; filtro de diferenças; ofertas lado a lado e compartilhamento do link.

A troca de produto na página compartilhável atualiza a URL e salva a nova seleção.
Grupos explicitamente cadastrados são preservados. O grupo genérico de importação
“Especificações” é organizado na interface por características de tela, desempenho,
câmeras, conectividade, energia, software e demais campos, sem alterar o Firestore.
Seções aparecem conforme as características disponíveis na categoria comparada.
As notas e preços exibidos são os existentes no cadastro; não são importados da referência.

## Login, favoritos e comparações salvas

O login usa o provedor Google já ativado no Firebase Authentication. O cabeçalho
mostra “Entrar com Google” ou “Minha conta”. O login é solicitado também ao clicar
em um botão de gostar ou salvar sem sessão. Cancelamento, popup bloqueado e falhas
de rede são tratados com mensagens na interface.

- `/minha-conta`: comparações salvas, produtos favoritos, comparações favoritas e saída da conta.
- Produtos: botão de coração no card e botão de gostar na ficha.
- Comparações: gostar e salvar são independentes, com remoção pelo mesmo botão.

Os itens ficam em `users/{uid}/likedProducts`, `likedComparisons` e `savedComparisons`,
com acompanhamento em tempo real. A interface não mostra o cache de outro UID ao
trocar de conta ou sair. As regras restringem acesso ao dono da conta, validam
produtos ativos e exigem dois produtos diferentes da mesma categoria nas comparações.
Os documentos armazenam referências aos produtos e data de criação; não guardam
cópias de tokens, senhas ou dados do perfil Google.

Para publicar em outro domínio, adicione esse domínio à lista de domínios autorizados
no Firebase Authentication. `localhost` já está autorizado no projeto atual.

```sh
npm run test:rules
```

Este teste usa Java 21 e o emulador Firestore com o projeto de demonstração
`demo-comparacel`, sem tocar nos dados reais. Verifica acesso do dono, isolamento
entre usuários, bloqueio de visitantes, campos permitidos, pares válidos e remoção.
A regra publicada antes desta mudança está guardada localmente em
`data/firestore-rules-before-accounts.json`.

### Comparações automáticas e conta privada

A página `/comunidade` mostra apenas os pares mais comparados, registrados automaticamente ao acessar uma ficha. Não há perfil público nem publicação manual no fluxo. Favoritos e comparações salvas permanecem privados em `/minha-conta`; o login com Google também permite reagir nas páginas de produto. Links antigos de perfis e publicações redirecionam para a lista. Os dados antigos não foram apagados.

### Visitas e termômetro de interesse

Páginas de produto e pares de comparação exibem visitas e o total agregado de favoritos. O termômetro no produto mede popularidade: visita = 1 ponto, favorito = 10; faixas em 0, 25, 100, 300 e 1.000 pontos. Ele não é uma avaliação de qualidade. Os totais de visitas começam com a implantação deste recurso, sem inventar histórico.

`POST /api/engagement` valida produtos ativos e compatibilidade do par, conta por transação e devolve apenas totais. Um cookie assinado, HttpOnly e SameSite=Lax identifica o navegador; a mesma página só registra outra visita após 30 minutos. Pares invertidos compartilham o contador. Sem cookie (ou após apagá-lo), o navegador será considerado novo; este contador não pretende identificar pessoas únicas nem bloquear automação sofisticada.

O servidor precisa de credenciais Firebase Admin (`GOOGLE_APPLICATION_CREDENTIALS` localmente ou `FIREBASE_SERVICE_ACCOUNT_JSON` nos segredos da hospedagem) e `VIEWS_COOKIE_SECRET` aleatório e estável. Nunca use o prefixo `NEXT_PUBLIC_` nesses segredos. A configuração local já usa a credencial fornecida. Em produção, configure essas variáveis antes de publicar.

Os favoritos continuam privados. A API usa consultas agregadas de `likedProducts`/`likedComparisons` com os índices definidos em `firestore.indexes.json`. Recibos de deduplicação privados expiram em sete dias pelo campo `visitors.expiresAt`; a política TTL está no mesmo arquivo. Os totais não expiram. Rode `firebase deploy --only firestore:indexes --project comparacel` ao configurar outro ambiente. Se o servidor ou os índices estiverem indisponíveis, a interface informa a indisponibilidade em vez de mostrar números falsos.


### Reações da comunidade e selos

Somente a página de produto oferece os botões de reação: triste (“Não gostei”), feliz (“Gostei”) e muito feliz (“Adorei”). Nos cards e na comparação, cada produto mostra apenas o grau agregado das reações, sua distribuição e o selo, sem permitir votar. A API aceita votos somente em produtos. O coração foi nomeado “Favoritar” para guardar itens sem confundir favorito com avaliação.

Os selos refletem a opinião da comunidade, separados do termômetro de interesse por visitas. Com menos de 10 votos por item, aparece “Aguardando opiniões”. A média suavizada é `(6 + feliz * 0.75 + muito_feliz) / (10 + total)`: ela adiciona 10 opiniões iniciais equivalentes a 60% para reduzir instabilidade em amostras pequenas. A partir de 65%, o selo “Em alta” é verde; até 40%, “Em baixa” é vermelho; entre essas faixas, “Opiniões variadas”. Essas escolhas são critérios do produto, ajustáveis; não uma estimativa de satisfação de todos os compradores.

`POST /api/reactions` verifica o token Google, email verificado e revogação da sessão. A transação mantém uma reação por UID/item, atualiza os totais ao trocar ou retirar e valida produtos ativos da mesma categoria. Os limites são aplicados no servidor: 20 votos/alterações numa janela de 24 horas a partir do primeiro voto, 10 segundos entre ações e 60 segundos para mudar a reação no mesmo item. Retirar é permitido mesmo após atingir a cota, mas deixa registro do horário para não burlar o intervalo retirando e recolocando. Repetir o mesmo pedido não soma outro voto nem consome a cota.

`reactionStats` é público e contém somente contagens. Os votos em `users/{uid}/reactions` só podem ser lidos pelo titular; contagens, votos e limites não aceitam escritas diretas do navegador. Os limites em `reactionBudgets` ficam privados. As regras precisam ser publicadas ao configurar outro ambiente. Os testes do emulador verificam concorrência, troca, retirada, limites, expiração da janela e isolamento. A proteção limita abuso por conta; múltiplas contas ainda exigiriam moderação e controles adicionais se houver ataques coordenados.

A interface usa `@remixicon/react` por meio de `app/components/icons.tsx`. As reações usam os ícones de rosto triste, feliz e sorridente, com as mesmas formas no indicador e nos botões. Ícones decorativos ficam ocultos para leitores de tela; os botões têm rótulos e estado `aria-pressed`.

### Índice Comparacel (1 a 10)

Os cards compactos exibem contadores de reação junto ao coração e uma nota circular sobre a foto. A cor segue uma escala contínua de vermelho a verde. A página de produto oferece a explicação da nota.

O índice combina reações (50%), preço relativo à categoria (20%), favoritos (15%), pessoas que salvaram comparações contendo o produto (10%) e visitas (5%). Preço é `mediana da categoria / (mediana + preço)`; se faltar, seu peso é redistribuído. Favoritos e salvamentos usam crescimento logarítmico até 50, visitas até 1.000, começando no meio da escala sem atividade para não penalizar novos produtos. Reações usam a média suavizada existente. A soma ponderada é convertida para 1–10 e arredondada para uma casa decimal. Com menos de 10 opiniões, a nota é provisória e tem borda tracejada. É um índice de preço e interesse, não uma nota técnica ou garantia de qualidade.

`POST /api/product-metrics` recebe até 24 IDs ativos por consulta e retorna somente totais. Salvamentos contam UIDs distintos, para que vários pares salvos pela mesma conta não inflem um produto. O índice `savedComparisons.productIds` do tipo COLLECTION_GROUP/CONTAINS suporta essa leitura. A interface agrupa pedidos dos cards, reutiliza os resultados por 60 segundos e atualiza ao alterar favoritos/salvamentos; as reações vêm dos indicadores públicos em tempo real.

A barra fixa de comparação exibe miniaturas e nomes dos produtos selecionados, remoção individual, espaço para o segundo produto e ação para abrir o par. O layout branco e compacto mantém uma linha no desktop e duas linhas no celular, com a área de leitura reservada no fim da página.

### Mais comparados

`/comunidade` apresenta os pares mais acessados nos últimos sete dias (incluindo hoje), filtrados por categoria, com imagens e acesso à ficha. Usar o comparador registra o par automaticamente, sem exigir login ou publicar nome/opinião.

O registro ocorre junto à transação do contador de visitas. Cada navegador conta uma vez por par a cada 30 minutos; inverter os produtos mantém o mesmo registro. A coleção privada `comparisonActivity` mantém somente IDs de produtos, categoria, totais diários da última semana e atualização. `GET /api/popular-comparisons` devolve os 12 maiores totais por categoria, sem identidade de visitante, e lê as contagens atualizadas a cada consulta; a página atualiza a lista a cada minuto. Os dados anteriores à implantação do ranking não são inventados: a lista cresce com os acessos registrados a partir deste recurso. O título “Mais comparados” usa acessos como indicador de interesse, não pessoas únicas.

### SEO, sitemap e Google Tag Manager

O container do projeto Django (`GTM-PN53J4BW`) foi reaproveitado. `NEXT_PUBLIC_GTM_ID` permite trocá-lo e `NEXT_PUBLIC_SITE_URL` define o domínio canônico (padrão `https://comparacel.com.br`). O script e o fallback sem JavaScript estão no layout. A navegação interna envia `comparacel_page_view` ao `dataLayer`, com caminho, URL e título; configurar esse evento como gatilho no painel do GTM depende das tags do container. O Firebase Analytics continua opcional e desativado por padrão.

Produtos, categorias e comparações recebem conteúdo inicial pelo servidor, além de título, descrição, canonical, Open Graph e Twitter. O catálogo público usa cache em memória de 60 segundos; somente campos públicos normalizados são enviados ao navegador. Produtos inativos e pares inválidos retornam 404. Pares invertidos redirecionam permanentemente para a ordem canônica. O servidor da hospedagem precisa das credenciais Firebase Admin já documentadas.

`/sitemap.xml` lista produtos ativos, categorias, marcas e até 5.000 pares válidos já importados/acessados, sem criar todas as combinações possíveis. `/robots.txt` informa o sitemap e bloqueia APIs, administração e conta privada. As fichas possuem JSON-LD de produto, ofertas cadastradas e breadcrumbs, sem apresentar o índice de popularidade como avaliação de compradores. O blog não foi migrado.

As URLs antigas `/compare/{par}`, `/compare`, `/comparacoes` e `/busca` redirecionam permanentemente para os destinos atuais. Categorias e marcas mantêm seus caminhos originais, sem a barra final. O host `www.comparacel.com.br` redireciona para o domínio canônico; DNS e certificado dos dois hosts devem apontar para a hospedagem ao colocar o novo site em produção.

Se a propriedade do Search Console usar verificação por HTML, configure `GOOGLE_SITE_VERIFICATION` com o código dessa propriedade; verificação via DNS permanece no domínio. Após publicar no domínio final, envie `https://comparacel.com.br/sitemap.xml` no Search Console. O código local não altera configurações do painel do Google nem garante indexação imediata.


### Painel administrativo

`/admin` oferece métricas agregadas, busca e filtros do catálogo, cadastro/edição de produtos, ativação/desativação, upload de imagens, ofertas por loja, ficha técnica por grupo, pontos positivos/de atenção, nota editorial e campos SEO. Marcas e lojas podem ser cadastradas para uso nas fichas. As categorias existentes são as 11 categorias do catálogo atual. Novos produtos começam como rascunhos e a URL de produtos existentes permanece fixa.

O acesso exige uma conta Google com e-mail verificado e autorização no servidor: configure `ADMIN_EMAILS` com os e-mails autorizados, separados por vírgula, ou atribua a custom claim `admin: true` via Firebase Admin. Sem uma dessas autorizações, o acesso é negado. `ADMIN_EMAILS` nunca deve receber o prefixo `NEXT_PUBLIC_`. O link para administração aparece na conta após a verificação do servidor. Na hospedagem, configure a mesma lista nos segredos do ambiente.

Todas as APIs `/api/admin/*` verificam token, revogação e permissão em cada pedido. Escritas também validam origem, campos, referências e limites. As regras do Firestore e Storage continuam bloqueando escritas diretas; somente o servidor autorizado usa o Firebase Admin. Rascunhos, histórico do painel e auditoria não são disponibilizados nas APIs públicas nem no catálogo enviado ao navegador.

Cada alteração de produto tem uma versão: se outra edição salvou a ficha antes, o servidor responde 409 e pede para reabri-la. A gravação do produto e do registro privado `adminAudit` ocorre na mesma transação. O menor preço disponível é recalculado ao salvar; mudanças de preços conhecidos registram pontos reais em `priceHistory`. Não há exclusão definitiva de produtos no painel.

Imagens em JPG, PNG ou WebP são validadas pelo conteúdo, tamanho (até 5 MB), dimensões (até 5.000 px por lado e 16 milhões de pixels) e ausência de animação. O envio cria um arquivo novo em `products/admin/`; a imagem só entra na ficha ao salvar. Substituições não apagam arquivos antigos. O catálogo público tem cache em memória de até 60 segundos, invalidado pelo salvamento no processo que atende à alteração.

Os testes do emulador usam `demo-comparacel` para verificar criação, edição, rascunhos, referências, preços, histórico, auditoria, concorrência e bloqueio de escritas diretas. O teste de interface usa uma identidade simulada e intercepta todas as APIs administrativas, sem conceder privilégios nem alterar produtos reais.

### Cadastro em massa pelo painel

Em `/admin`, abra **Importar em massa**, escolha a fonte e a categoria e envie um `.txt` ou cole os links. Amazon: um link `amazon.com.br/dp/ASIN` ou `amzn.to` por linha. Mercado Livre: uma URL de catálogo `/p/MLB…` por linha; para afiliados, use `https://meli.la/seu-link https://www.mercadolivre.com.br/p/MLB12345678`. Links de compra são preservados. Comentários `#`, linhas vazias e linhas idênticas são ignorados.

O lote processa até 200 linhas, com intervalo mínimo de quatro segundos, progresso, interrupção após o item atual e repetição dos itens com erro. Mantenha a aba aberta; o processamento depende dela. O servidor limita a 200 tentativas por hora por administrador e bloqueia importações simultâneas da mesma conta.

Novos produtos ficam desativados para revisão. Marca e loja são cadastradas quando necessário. Imagens válidas podem ser copiadas para o Storage; preços e características vêm da fonte. As vantagens de especificações não são inferidas automaticamente. Reimportações usam o identificador da loja, inclusive nas ofertas migradas, para evitar duplicatas. Produtos existentes conservam nome, categoria, publicação, imagem, SEO, nota editorial e especificações editadas; acrescentam características ausentes e atualizam a oferta da fonte. Preço ausente não apaga um preço anterior. O vínculo de origem, a gravação do produto, o histórico de preço e a auditoria são atômicos.

Amazon pode responder com captcha/bloqueio. O importador reporta essa falha sem inventar ficha. Mercado Livre usa a API oficial de catálogo e requer `ML_ACCESS_TOKEN` privado no servidor; quando expirar, atualize o token. Nenhum token é enviado ao navegador. `adminImportSources` e `adminImportBudgets` são privados pelas regras existentes. Downloads aceitam somente os domínios das fontes e seus CDNs conhecidos, validando também redirecionamentos, tamanho e conteúdo das imagens.
