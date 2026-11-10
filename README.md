# Achado de Garagem — bot de afiliados

Bot de afiliados da marca **Achado de Garagem**: acessórios e cuidados automotivos. Detecta ofertas reais e publica automaticamente com link de afiliado. Roda sozinho de hora em hora via GitHub Actions (cron), sem depender do seu PC ligado. De hora em hora é o bastante para pegar queda de preço e cabe com folga nos 2.000 minutos grátis por mês de repositório privado.

Fontes: Mercado Livre e Shopee. Divulgação:
- **Telegram**, automático: toda queda de preço aprovada vai pro canal, e também os projetos publicados.
- **TikTok**, manual: vídeos "quanto custa esse projeto" com preços de peças parecidas por cima; o bot acha as peças e prepara textos, legenda e o post do canal (ver [Projetos](#7-projetos-quanto-custa-esse-projeto)).

## Estrutura

```
src/
  sources/     # fontes de produtos; cada uma implementa a interface Source (sources/types.ts)
  curation/    # filtro do nicho, histórico de preço, "oferta real" e anti-repetição
  content/     # formatação comum a todos os canais (preço, título enxuto)
  channels/    # canais de publicação; cada um implementa a interface Publisher (channels/types.ts)
  projeto/     # "quanto custa esse projeto": peças parecidas, textos do vídeo, legenda e post
  run.ts       # orquestra: fontes → curadoria → todos os canais ligados
  projeto.ts   # entrada do workflow "projeto"
```

Fontes e canais são ligados pelas variáveis `SOURCES` e `CHANNELS` (lista separada por vírgula; vazio = padrão). Cada um valida só as próprias variáveis de ambiente, e só quando está ligado.

**Identificação de publicidade:** por decisão do dono do canal (19/10/2026), os posts não trazem `#publi`. No Telegram, a descrição do canal menciona a comissão. No TikTok, a identificação fica com quem posta (marcação de conteúdo comercial do próprio app). O art. 36 do Código de Defesa do Consumidor e o guia do CONAR (em vigor desde 01/06/2026) tratam link de afiliado como publicidade que precisa ser identificável. Para voltar a identificar no post, é só reintroduzir a linha em `src/channels/telegram/formatMessage.ts`, `src/projeto/messages.ts` e `config/projeto.json`.

## Aviso de segurança

O `refresh_token` do Mercado Livre fica salvo, **criptografado** (AES-256-GCM), em `data/ml-token.enc` e é commitado no repositório a cada execução (ele muda a cada uso — é assim que a API do ML funciona). A criptografia evita que um vazamento do repositório sozinho comprometa sua conta, mas mesmo assim: **o repositório precisa ser privado** no GitHub, como camada extra de proteção.

## Setup (passo a passo)

### 1. Telegram
1. Fale com [@BotFather](https://t.me/BotFather), rode `/newbot` e guarde o token gerado.
2. Crie o canal onde as ofertas vão ser postadas e adicione o bot como administrador com permissão de postar mensagens.
3. Pegue o `chat_id` do canal: se for público, é `@seucanal`; se for privado, encaminhe uma mensagem do canal para [@JsonDumpBot](https://t.me/JsonDumpBot) e leia o `id` numérico (geralmente negativo, tipo `-100...`).

### 2. Mercado Livre — afiliados
1. Cadastre-se no [Portal de Afiliados](https://afiliados.mercadolivre.com.br).
2. Gere **um** link de teste para qualquer produto pelo painel.
3. Abra a URL gerada e copie os valores dos parâmetros `matt_word` e `matt_tool` — são fixos pra sua conta e o bot vai reusar eles em todo link que gerar.

### 3. Mercado Livre — aplicação/API
1. Crie uma aplicação em [developers.mercadolivre.com.br](https://developers.mercadolivre.com.br) e anote o **Client ID** e o **Client Secret**. No cadastro:
   - URIs de redirect: o link do seu repositório no GitHub (ex: `https://github.com/usuario/repo`). O ML exige `https` e não aceita `localhost`. O endereço só serve pra devolver o código na barra do navegador (ver passo 5).
   - Fluxos OAuth: **Authorization Code** e **Refresh Token**. Sem o Refresh Token, o acesso vale poucas horas e o bot não consegue renovar sozinho.
   - PKCE desligado, unidade de negócio Mercado Livre, nenhum tópico de notificação.
   - Permissões: o mínimo. O bot só lê anúncios públicos.
2. Copie `.env.example` para `.env` e preencha `ML_CLIENT_ID`, `ML_CLIENT_SECRET` e `ML_REDIRECT_URI`, este último igual ao cadastrado no app.
3. Gere a chave de criptografia local e cole em `ML_TOKEN_ENCRYPTION_KEY` no `.env`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
4. Rode `npm install`.
5. Rode `npm run setup:ml-oauth`:
   - ele mostra uma URL de autorização; abra, faça login e autorize;
   - o navegador abre o endereço de redirect com `?code=TG-...` no final;
   - copie o endereço completo da barra e cole no terminal;
   - o script salva `data/ml-token.enc`.

   O código vale poucos minutos, é de uso único e não funciona sem o Client Secret. Por isso não tem problema ele passar pela página do GitHub.

### 4. Shopee — afiliados e Open API
1. Cadastre-se em [affiliate.shopee.com.br](https://affiliate.shopee.com.br). A aprovação é manual e leva uns 5–15 dias, e a Shopee pede um perfil em rede social.
2. Depois de aprovado, abra a seção **Open API** no painel e copie o **App ID** e o **Secret** para `SHOPEE_APP_ID` e `SHOPEE_APP_SECRET` no `.env`.
3. Confira se a API responde antes de ligar a Shopee no bot:
   ```bash
   npm run check:shopee -- "suporte celular carro"
   ```
   O comando faz uma busca e lista os produtos, sem publicar nada.
   - `A Shopee recusou: Shopee 10020` = App ID/Secret errado.
   - `10035` = a conta ainda não tem acesso à Open API.

As buscas, a nota mínima e as vendas mínimas ficam em `config/shopee.json`.

### 5. Repositório e GitHub Actions
1. Crie o repositório no GitHub como **privado**.
2. Em Settings → Secrets and variables → Actions, cadastre:
   - **Secrets**: `TELEGRAM_BOT_TOKEN`, `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_TOKEN_ENCRYPTION_KEY`, `SHOPEE_APP_ID`, `SHOPEE_APP_SECRET`.
   - **Variables**: `TELEGRAM_CHANNEL_ID`, `ML_AFFILIATE_MATT_WORD`, `ML_AFFILIATE_MATT_TOOL`, `SOURCES=mercadolivre,shopee` (sem `SOURCES`, só o Mercado Livre roda) e `TELEGRAM_KIT_CHAT_ID` (ver passo 7). Opcional: `CHANNELS`.
3. Faça commit e push do projeto, incluindo `data/ml-token.enc` gerado no passo anterior.
4. Em Actions → run-bot, dispare manualmente (`Run workflow`) uma vez pra validar antes de confiar no cron.

Se uma fonte falhar durante a execução (API fora do ar, credencial vencida), as outras continuam publicando. A execução termina com erro no GitHub, para você ficar sabendo.

### 6. Curadoria
A fonte do Mercado Livre usa a **API de catálogo**. A de anúncios (`/sites/MLB/search`, `/items`) responde 403 para apps comuns desde outubro de 2026. Em `config/watchlist.json`:

```json
{
  "productIds": ["MLB25804364"],
  "searchQueries": ["aspirador automotivo"],
  "highlightCategories": ["MLB1747"],
  "searchLimit": 10
}
```

- `productIds`: produtos fixos. É o `MLB...` que vem depois de `/p/` no endereço do produto.
- `searchQueries`: busca por palavra-chave no catálogo. Muitos resultados são produtos sem ninguém vendendo e ficam de fora.
- `highlightCategories`: os mais vendidos de cada categoria. O arquivo já vem com acessórios, interior e exterior, limpeza, ferramentas, som e GPS.

Para cada produto, o bot pega a **oferta nova mais barata** entre os vendedores. O link leva à página do produto com essa oferta selecionada, e "loja oficial" é a do vendedor dela. Uma busca que falha é pulada; se **todas** falharem, a execução fica vermelha.

Todo produto passa antes pelo filtro do nicho, em `config/niche.json`. Como a publicação é automática, é ele que segura o que não pode sair:
- `blockedTerms`: nunca publica. Anti-radar, bloqueador de sinal, película espelhada, película de farol ou de placa, e o que estiver fora do nicho.
- `officialStoreOnlyTerms`: só publica quando o produto vem de loja oficial. Hoje: pneu, cadeirinha infantil, airbag e cinto.

Kits de xenon/LED de farol, freio, suspensão e peças de direção e roda foram liberados a pedido do dono do canal (19/10/2026).

Os termos casam palavras inteiras, sem diferenciar maiúsculas nem acentos: `anti radar` pega "Gel Anti-Radar", mas "Suporte GPS com alerta de radar" passa.

O limiar de queda pra considerar "oferta real" é `DISCOUNT_THRESHOLD_PERCENT` no `.env`/Secrets (padrão 15%).

### 7. Projetos ("quanto custa esse projeto")
O conteúdo do TikTok são vídeos de carro rebaixado ou tunado com o preço de peças parecidas por cima ("Farol + R$390", "Roda aro 17 + R$2.500"… e o total no fim). A legenda manda a pessoa pro canal do Telegram, onde o projeto fica com o link de afiliado de cada peça.

Pra cada vídeo, rode o workflow **projeto** (Actions → projeto → Run workflow; funciona pelo app do GitHub):
- `itens`: as peças, separadas por `;`. Cada uma pode ser:
  - nome e valor aproximado (`roda aro 17: 12k`): o bot busca uma peça parecida no catálogo do ML, na mesma faixa de preço. Fica só com o tipo de produto que o ML prevê pra peça ("insulfilm" é película automotiva, não residencial) e com os números do nome no título (roda aro 17 não vira aro 18). Nome ambíguo pode não achar nada ("ponteira" sozinha); aí vale ser específico (`ponteira escapamento`) ou mandar o link;
  - nome, preço e link de um produto do ML (`farol: 389 https://produto.mercadolivre.com.br/...`), pras peças que a busca não acha. Farol e muitas peças de tuning só existem como anúncio comum, que a API do ML não deixa buscar. Com link de catálogo (`/p/MLB...`), o preço é lido sozinho.
- `carro` (opcional): modelo do carro do vídeo (`saveiro g6`). O bot prefere peça que cita o modelo; sem nenhuma à venda, fica com uma universal.
- `titulo` (opcional): nome do projeto, vai na legenda e no post.
- `publicar`: desmarcado, manda só a prévia no seu privado; marcado, também posta no canal.

No seu Telegram privado (`TELEGRAM_KIT_CHAT_ID`; mande `/start` pro bot antes) chegam:
- os textos pro vídeo, na ordem, e o total;
- a legenda, com o chamado pro canal (em `config/projeto.json`);
- a peça escolhida pra cada item. Peça que não deu pra achar aparece com o motivo e fica fora do total.

O workflow usa o mesmo grupo do run-bot, porque os dois renovam o mesmo token do ML, e salva o token renovado. Por isso, rode pelo GitHub e não com `npm run projeto` no seu PC: o token local ficaria desatualizado.

A edição e a postagem do vídeo são manuais. O bot não baixa, edita nem reposta vídeo de terceiros. Repostar vídeo de outro criador sem autorização pode render denúncia por direito autoral e strike na conta.

## Rodando localmente

```bash
npm install
npm run typecheck
npm test
npm run bot
```

`npm run bot` carrega o `.env` local e posta de verdade no canal configurado — use um canal de teste até validar o pipeline. No GitHub Actions não existe `.env`, e as variáveis vêm dos Secrets/Variables.

## Pontos a confirmar na primeira execução real

A fonte do Mercado Livre foi testada contra a API real em 19/10/2026: 105 produtos com vendedor ativo em ~50s, com nome, foto, preço e loja oficial. Fica a confirmar, abrindo no navegador um link postado pelo bot:
- se o parâmetro `pdp_filters=item_id:...` abre a página já com a oferta escolhida, para o preço do post bater com o da página;
- se a comissão de afiliado é registrada com `matt_word`/`matt_tool` nesse link. O teste de cliques no painel de afiliado responde isso.

A fonte Shopee foi escrita a partir de implementações públicas da Open API, porque a documentação oficial fica atrás do login. O `npm run check:shopee` confirma, antes da primeira execução:
- o endpoint `open-api.affiliate.shopee.com.br/graphql` e a assinatura;
- os nomes dos campos (`priceMin`, `ratingStar`, `sales`, `shopType`, `offerLink`);
- o domínio do `offerLink`. O bot só aceita `https` em `shopee.com.br` ou subdomínio e descarta o resto, então um "DESCARTADO" em todas as linhas aponta para isso.

## Escopo

Nicho: acessórios, cuidados e peças automotivas, com foco em carro rebaixado e tunado. Divulgação pelo TikTok (vídeos "quanto custa esse projeto", editados e postados por você) e pelo Telegram (quedas de preço automáticas e os projetos).

- **Feito**:
  - fontes Mercado Livre (catálogo) e Shopee, canal Telegram;
  - filtro do nicho;
  - nota e vendas mínimas na Shopee;
  - projetos: peças parecidas, textos do vídeo, legenda e post no canal.
- **Próximo**: buscar as peças dos projetos também na Shopee quando o cadastro for aprovado. A API da Shopee busca anúncios, o que cobre farol e peças de tuning.
- **Fora de escopo, por design**: Amazon (a API exige vendas prévias, inviável pra canal novo) e automação de Canais do WhatsApp (sem API oficial da Meta; as alternativas não-oficiais violam os termos do WhatsApp e arriscam banir o número).
