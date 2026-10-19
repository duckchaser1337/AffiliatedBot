import path from "node:path";
import { createInterface } from "node:readline/promises";
import { extractAuthCode } from "../src/sources/mercadolivre/auth.js";
import { mlTokenResponseSchema } from "../src/sources/mercadolivre/schemas.js";
import { writeTokenFile } from "../src/sources/mercadolivre/tokenStore.js";

// Script local rodado UMA vez pelo usuário para obter o primeiro refresh_token do
// Mercado Livre via OAuth Authorization Code flow. Não roda no GitHub Actions.
//
// O ML exige redirect_uri com https e não aceita localhost. Em vez de subir um servidor público,
// o redirect aponta pra uma página https qualquer da pessoa (ex: o próprio repositório no GitHub):
// depois de autorizar, o endereço na barra traz o ?code=..., e a pessoa cola ele aqui.
// O código vale poucos minutos, é de uso único e não serve pra nada sem o Client Secret.

const CLIENT_ID = process.env.ML_CLIENT_ID;
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
const ENCRYPTION_KEY = process.env.ML_TOKEN_ENCRYPTION_KEY;
// Tem que ser idêntico ao cadastrado no app em developers.mercadolivre.com.br.
const REDIRECT_URI = process.env.ML_REDIRECT_URI;

if (!CLIENT_ID || !CLIENT_SECRET || !ENCRYPTION_KEY || !REDIRECT_URI) {
  console.error(
    "Defina ML_CLIENT_ID, ML_CLIENT_SECRET, ML_TOKEN_ENCRYPTION_KEY e ML_REDIRECT_URI no seu .env antes de rodar este script.",
  );
  console.error("ML_REDIRECT_URI é o endereço https cadastrado em \"URIs de redirect\" no app do Mercado Livre.");
  process.exit(1);
}

const authUrl = new URL("https://auth.mercadolivre.com.br/authorization");
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);

console.log("\n1. Abra esta URL no navegador, faça login na conta do Mercado Livre e autorize o app:\n");
console.log(authUrl.toString());
console.log(`\n2. Depois de autorizar, o navegador abre ${REDIRECT_URI} com um ?code=... no final do endereço.`);
console.log("3. Copie o endereço completo da barra (com o ?code=...) e cole abaixo.");
console.log("   O código vale por poucos minutos e só pode ser usado uma vez.\n");

const prompt = createInterface({ input: process.stdin, output: process.stdout });
const answer = await prompt.question("Endereço ou código: ");
prompt.close();

const code = extractAuthCode(answer);
if (!code) {
  console.error("Não encontrei o código. Cole o endereço inteiro da barra, com o ?code=TG-...");
  process.exit(1);
}

const response = await fetch("https://api.mercadolibre.com/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URI,
  }),
});

if (!response.ok) {
  console.error(`Falha ao trocar o código por token (${response.status}): ${await response.text()}`);
  console.error("Se o erro falar em redirect_uri, confira se o endereço cadastrado no app é exatamente", REDIRECT_URI);
  console.error("Se falar em refresh_token ausente, ative o escopo offline_access no app.");
  process.exit(1);
}

const token = mlTokenResponseSchema.parse(await response.json());
const tokenPath = path.join(process.cwd(), "data", "ml-token.enc");
await writeTokenFile(tokenPath, token.refresh_token, ENCRYPTION_KEY);
console.log("\nPronto: token salvo em data/ml-token.enc.");
