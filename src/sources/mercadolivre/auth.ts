import { mlTokenResponseSchema, type MlTokenResponse } from "./schemas.js";

const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

export interface MlCredentials {
  clientId: string;
  clientSecret: string;
}

// Aceita o endereço inteiro da barra do navegador depois da autorização
// (ex: https://github.com/usuario/repo?code=TG-...) ou só o código.
export function extractAuthCode(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).searchParams.get("code") ?? undefined;
  } catch {
    return /^TG-[\w-]+$/.test(trimmed) ? trimmed : undefined;
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  credentials: MlCredentials,
): Promise<MlTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao renovar token do Mercado Livre (${response.status}): ${body}`);
  }

  const json = await response.json();
  return mlTokenResponseSchema.parse(json);
}
