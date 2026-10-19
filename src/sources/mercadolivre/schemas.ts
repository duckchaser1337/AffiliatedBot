import { z } from "zod";

// Só a API de catálogo responde pra apps comuns: /sites/MLB/search, /items e /user-products
// devolvem 403 (confirmado em 19/10/2026). Cada registro é validado separadamente: um
// malformado não derruba a lista inteira.

export const mlCatalogProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  pictures: z.array(z.object({ url: z.string().optional() })).optional(),
});

export type MlCatalogProduct = z.infer<typeof mlCatalogProductSchema>;

// Uma oferta (anúncio de um vendedor) dentro de um produto de catálogo.
export const mlOfferSchema = z.object({
  item_id: z.string(),
  price: z.number().positive(),
  condition: z.string().optional(),
  official_store_id: z.number().nullable().optional(),
});

export type MlOffer = z.infer<typeof mlOfferSchema>;

export const mlResultsSchema = z.object({ results: z.array(z.unknown()) });

export const mlHighlightsSchema = z.object({
  content: z.array(z.object({ id: z.string(), type: z.string() })),
});

export const mlTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
});

export type MlTokenResponse = z.infer<typeof mlTokenResponseSchema>;
