import { z } from "zod";

export const mlItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number().nonnegative(),
  currency_id: z.string(),
  thumbnail: z.string().optional(),
  permalink: z.string().url(),
  available_quantity: z.number().int().nonnegative(),
  status: z.string(),
});

export type MlItem = z.infer<typeof mlItemSchema>;

export const mlSearchResultSchema = z.object({
  results: z.array(z.object({ id: z.string() })),
});

export const mlTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
});

export type MlTokenResponse = z.infer<typeof mlTokenResponseSchema>;
