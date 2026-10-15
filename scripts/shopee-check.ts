import { API_URL, searchProductOffers, ShopeeApiError } from "../src/sources/shopee/client.js";
import { loadShopeeCredentials } from "../src/sources/shopee/index.js";
import { mapToProduct } from "../src/sources/shopee/mapToProduct.js";

// Script local pra conferir a Open API da Shopee com credenciais reais: faz UMA busca
// e mostra o que o bot aproveitaria. Não publica nada nem grava estado.
//   npm run check:shopee -- "suporte celular carro"

const keyword = process.argv[2] ?? "aspirador automotivo";

function host(link: string | null | undefined): string {
  try {
    return link ? new URL(link).hostname : "(sem link)";
  } catch {
    return `(link inválido: ${link})`;
  }
}

try {
  const credentials = loadShopeeCredentials();
  console.log(`Endpoint: ${API_URL}`);
  console.log(`Buscando "${keyword}" (10 mais vendidos)...\n`);

  const offers = await searchProductOffers(keyword, { sortType: 2, limit: 10 }, credentials);
  for (const offer of offers) {
    const mapped = mapToProduct(offer);
    console.log(
      [
        mapped ? "OK        " : "DESCARTADO",
        offer.productName.slice(0, 60),
        `preço=${offer.priceMin}`,
        `nota=${offer.ratingStar ?? "-"}`,
        `vendas=${offer.sales ?? "-"}`,
        `loja oficial=${mapped?.product.officialStore ? "sim" : "não"}`,
        `link=${host(offer.offerLink)}`,
      ].join(" | "),
    );
  }
  console.log(`\n${offers.length} ofertas recebidas.`);
} catch (error) {
  if (error instanceof ShopeeApiError) {
    console.error(`A Shopee recusou: ${error.message}`);
    console.error("10020 = assinatura/credencial, 10035 = conta sem acesso à Open API, 10030 = limite de requisições.");
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
}
