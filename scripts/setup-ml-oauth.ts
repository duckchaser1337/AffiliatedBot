import { createServer } from "node:http";
import path from "node:path";
import { mlTokenResponseSchema } from "../src/sources/mercadolivre/schemas.js";
import { writeTokenFile } from "../src/sources/mercadolivre/tokenStore.js";

// Script local rodado UMA vez pelo usuário para obter o primeiro refresh_token do
// Mercado Livre via OAuth Authorization Code flow. Não roda no GitHub Actions.

const CLIENT_ID = process.env.ML_CLIENT_ID;
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
const ENCRYPTION_KEY = process.env.ML_TOKEN_ENCRYPTION_KEY;
const PORT = 8734;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

if (!CLIENT_ID || !CLIENT_SECRET || !ENCRYPTION_KEY) {
  console.error(
    "Defina ML_CLIENT_ID, ML_CLIENT_SECRET e ML_TOKEN_ENCRYPTION_KEY no seu .env antes de rodar este script.",
  );
  process.exit(1);
}

const authUrl = new URL("https://auth.mercadolivre.com.br/authorization");
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);

console.log("\nAbra esta URL no navegador, faça login na conta do Mercado Livre e autorize o app:\n");
console.log(authUrl.toString());
console.log(`\nAguardando o redirect em ${REDIRECT_URI} ...`);
console.log(
  "(o Client ID precisa ter esse endereço cadastrado como redirect_uri em developers.mercadolivre.com.br;",
);
console.log(" se o ML recusar por exigir HTTPS, veja o README sobre usar um túnel local tipo ngrok)\n");

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", REDIRECT_URI);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("Faltou o parâmetro 'code' no redirect.");
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<p>Autorizado! Pode fechar esta aba e voltar pro terminal.</p>");

  exchangeCode(code)
    .then(() => {
      console.log("\nToken salvo com sucesso em data/ml-token.enc. Pode fechar este script (Ctrl+C).");
      server.close();
      process.exit(0);
    })
    .catch((error) => {
      console.error("Falha ao trocar o código por token:", error);
      server.close();
      process.exit(1);
    });
});

async function exchangeCode(code: string): Promise<void> {
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }

  const json = await response.json();
  const token = mlTokenResponseSchema.parse(json);

  const tokenPath = path.join(process.cwd(), "data", "ml-token.enc");
  await writeTokenFile(tokenPath, token.refresh_token, ENCRYPTION_KEY!);
}

server.listen(PORT);
