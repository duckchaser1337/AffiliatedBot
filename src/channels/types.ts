import type { Product } from "../sources/types.js";

export const CHANNEL_IDS = ["telegram"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

export interface ProductPost {
  product: Product;
  affiliateUrl: string;
  discountPercent: number;
}

export interface Publisher {
  readonly id: ChannelId;
  publishProduct(post: ProductPost): Promise<void>;
}
