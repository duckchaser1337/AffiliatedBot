export const SOURCE_IDS = ["mercadolivre"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export interface Product {
  source: SourceId;
  id: string;
  title: string;
  price: number;
  currency: string;
  url: string;
  imageUrl?: string;
  // Loja oficial da marca: itens de segurança (freio, cadeirinha...) só são publicados assim.
  officialStore?: boolean;
}

export interface Source {
  readonly id: SourceId;
  // Entrega um produto por vez: se a coleta quebrar no meio, o que já foi observado
  // continua no estado salvo, em vez de se perder junto com a lista inteira.
  products(): AsyncIterable<Product>;
  affiliateUrl(product: Product): Promise<string>;
}

// O id sozinho pode se repetir entre plataformas, então o estado usa a origem como prefixo.
export function productKey(product: Product): string {
  return `${product.source}:${product.id}`;
}
