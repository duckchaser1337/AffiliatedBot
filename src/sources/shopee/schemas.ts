import { z } from "zod";

// A API declara vários campos numéricos como String (preço, nota) e IDs como Int64;
// aceita os dois formatos e converte no mapeamento.
const numberLike = z.union([z.number(), z.string()]);

export const shopeeOfferSchema = z.object({
  itemId: numberLike,
  productName: z.string(),
  priceMin: numberLike,
  ratingStar: numberLike.nullable().optional(),
  sales: z.number().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  shopType: z.array(z.number()).nullable().optional(),
  productLink: z.string(),
  offerLink: z.string().nullable().optional(),
});

export type ShopeeOffer = z.infer<typeof shopeeOfferSchema>;

export const shopeeResponseSchema = z.object({
  data: z
    .object({
      // Cada oferta é validada separadamente: uma malformada não derruba a página inteira.
      productOfferV2: z.object({ nodes: z.array(z.unknown()) }).nullable().optional(),
    })
    .nullable()
    .optional(),
  errors: z
    .array(
      z.object({
        message: z.string().optional(),
        extensions: z.object({ code: z.number().optional(), message: z.string().optional() }).optional(),
      }),
    )
    .optional(),
});
