# Achado de Garagem — bot de afiliados

Bot de afiliados da marca **Achado de Garagem**: acessórios e cuidados automotivos. Detecta ofertas reais e publica automaticamente com link de afiliado. Roda sozinho via GitHub Actions (cron), sem depender do seu PC ligado.

Fontes: Mercado Livre e Shopee. Canal: Telegram. A estrutura separa **fontes** (de onde vêm os produtos) de **canais** (onde publica), para receber o Instagram em seguida (ver [Escopo](#escopo)).

## Estrutura

```
src/
  sources/     # fontes de produtos; cada uma implementa a interface Source (sources/types.ts)
  curation/    # filtro do nicho, histórico de preço, "oferta real" e anti-repetição
  content/     # textos comuns a todos os canais (ex: identificação #publi)
  channels/    # canais de publicação; cada um implementa a interface Publisher (channels/types.ts)
  run.ts       # orquestra: fontes → curadoria → todos os canais ligados
```

Fontes e canais são ligados pelas variáveis `SOURCES` e `CHANNELS` (lista separada por vírgula; vazio = padrão). Cada um valida só as próprias variáveis de ambiente, e só quando está ligado.

Todo post com link de afiliado começa com `#publi · link de afiliado`: o guia do CONAR em vigor desde 01/06/2026 trata link de afiliado como publicidade.

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
1. Crie uma aplicação em [developers.mercadolivre.com.br](https://developers.mercadolivre.com.br), anote o **Client ID** e o **Client Secret**.
2. Cadastre `http://localhost:8734/callback` como redirect URI da aplicação.
   - Se o Mercado Livre recusar por exigir HTTPS, use um túnel local (ex: `ngrok http 8734`) e ajuste `REDIRECT_URI` em `scripts/setup-ml-oauth.ts` para a URL do túnel — isso só precisa ser validado uma vez, no primeiro login.
3. Copie `.env.example` para `.env` e preencha `ML_CLIENT_ID`, `ML_CLIENT_SECRET`.
4. Gere a chave de criptografia local e cole em `ML_TOKEN_ENCRYPTION_KEY` no `.env`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
5. Rode `npm install` e depois `npm run setup:ml-oauth` — abre uma URL de autorização, você faz login/autoriza no navegador, e o script salva `data/ml-token.enc` automaticamente.

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
   - **Variables**: `TELEGRAM_CHANNEL_ID`, `ML_AFFILIATE_MATT_WORD`, `ML_AFFILIATE_MATT_TOOL` e `SOURCES=mercadolivre,shopee` (sem `SOURCES`, só o Mercado Livre roda). Opcional: `CHANNELS`.
3. Faça commit e push do projeto, incluindo `data/ml-token.enc` gerado no passo anterior.
4. Em Actions → run-bot, dispare manualmente (`Run workflow`) uma vez pra validar antes de confiar no cron.

Se uma fonte falhar durante a execução (API fora do ar, credencial vencida), as outras continuam publicando. A execução termina com erro no GitHub, para você ficar sabendo.

### 6. Curadoria
Preencha `config/watchlist.json` com os produtos que quer acompanhar:

```json
{
  "itemIds": ["MLB1234567890"],
  "searchQueries": ["aspirador automotivo"]
}
```

`itemIds` é a fonte principal e estável (o ID aparece na URL do produto, formato `MLB...`). `searchQueries` é best-effort — se a busca por palavra-chave falhar ou ficar instável, o bot ignora e segue só com `itemIds` (não derruba a execução). O arquivo já vem com buscas de acessórios e cuidados automotivos.

Todo produto passa antes pelo filtro do nicho, em `config/niche.json`. Como a publicação é automática, é ele que segura o que não pode sair:
- `blockedTerms`: nunca publica. Itens ilegais (anti-radar, kit xenon, lâmpada LED de "upgrade" para farol, película espelhada ou em placa) e o que estiver fora do nicho.
- `officialStoreOnlyTerms`: itens de segurança (freio, pneu, suspensão, cadeirinha, airbag). Só publica quando o produto vem de loja oficial.

Os termos casam palavras inteiras, sem diferenciar maiúsculas nem acentos: `anti radar` pega "Gel Anti-Radar", mas "Suporte GPS com alerta de radar" passa.

O limiar de queda pra considerar "oferta real" é `DISCOUNT_THRESHOLD_PERCENT` no `.env`/Secrets (padrão 15%).

## Rodando localmente

```bash
npm install
npm run typecheck
npm test
npm run bot
```

`npm run bot` carrega o `.env` local e posta de verdade no canal configurado — use um canal de teste até validar o pipeline. No GitHub Actions não existe `.env`, e as variáveis vêm dos Secrets/Variables.

## Pontos a confirmar na primeira execução real

A pesquisa técnica por trás deste projeto encontrou relatos de instabilidade recente no endpoint de busca do Mercado Livre (`/sites/MLB/search`), por isso ele é tratado como best-effort e isolado. Vale confirmar na prática, no primeiro `npm run bot`:
- Se `/items/{id}` retorna o campo `thumbnail` como documentado — se o nome do campo mudou, o bot continua funcionando, só sem imagem na mensagem (campo é opcional no schema).
- Se a busca por palavra-chave funciona com o seu token ou cai no fallback de log-e-segue.
- Se o campo `official_store_id` vem nos itens do ML. Se não vier, todo produto é tratado como loja não oficial: os itens de segurança são barrados, os acessórios comuns seguem normalmente.

A fonte Shopee foi escrita a partir de implementações públicas da Open API, porque a documentação oficial fica atrás do login. O `npm run check:shopee` confirma, antes da primeira execução:
- o endpoint `open-api.affiliate.shopee.com.br/graphql` e a assinatura;
- os nomes dos campos (`priceMin`, `ratingStar`, `sales`, `shopType`, `offerLink`);
- o domínio do `offerLink`. O bot só aceita `https` em `shopee.com.br` ou subdomínio e descarta o resto, então um "DESCARTADO" em todas as linhas aponta para isso.

## Escopo

Nicho: acessórios e cuidados automotivos (limpeza, gadgets, organização, eletrônicos). Publicação 100% automática.

- **Feito**:
  - fontes Mercado Livre (forte em peças e lojas oficiais) e Shopee (acessórios baratos), canal Telegram;
  - filtro do nicho com bloqueio de itens ilegais;
  - nota e vendas mínimas na Shopee.
  - Falta validar as duas fontes com credenciais reais.
- **Próximo — canal Instagram** como vitrine. O Telegram segue como canal principal de venda.
- **Fase 2**: peças por modelo de carro. Ficaram para depois porque peça errada vira devolução, e devolução cancela a comissão.
- **Fora de escopo, por design**: Amazon (a API exige vendas prévias, inviável pra canal novo) e automação de Canais do WhatsApp (sem API oficial da Meta; as alternativas não-oficiais violam os termos do WhatsApp e arriscam banir o número).
