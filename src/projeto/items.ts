export interface ProjectItem {
  label: string;
  // Valor aproximado da peça do carro do vídeo, ou o preço da página quando vem com link.
  approxPrice?: number;
  // Link de um produto do Mercado Livre escolhido à mão, pra peças que a busca não acha.
  url?: string;
}

// "2500", "2.500", "R$ 2.500,00", "12k", "1,5k" → número. Sem valor reconhecível, undefined.
export function parseApproxPrice(text: string): number | undefined {
  const clean = text.toLowerCase().replace(/r\$/g, "").replace(/\s/g, "");
  const match = /^(\d+(?:[.,]\d+)*)(k|mil)?$/.exec(clean);
  if (!match) return undefined;
  let digits = match[1];
  if (match[2]) {
    // "1,5k" / "1.5k": a vírgula ou o ponto é decimal.
    const value = Number(digits.replace(",", "."));
    return Number.isFinite(value) ? Math.round(value * 1000) : undefined;
  }
  // Formato brasileiro: ponto separa milhar, vírgula separa centavos.
  digits = digits.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

const URL_PATTERN = /https?:\/\/\S+/;

// Uma peça por linha ou separadas por ";":
//   "farol: 389 https://produto.mercadolivre.com.br/MLB-...; roda aro 17: 12k; insulfilm"
export function parseProjectItems(text: string): ProjectItem[] {
  return text
    .split(/[;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry): ProjectItem => {
      const url = URL_PATTERN.exec(entry)?.[0];
      const rest = (url ? entry.replace(url, "") : entry).trim();
      const separator = rest.lastIndexOf(":");
      const label = (separator === -1 ? rest : rest.slice(0, separator)).trim();
      const approxPrice = separator === -1 ? undefined : parseApproxPrice(rest.slice(separator + 1));
      return {
        label,
        ...(approxPrice !== undefined ? { approxPrice } : {}),
        ...(url ? { url } : {}),
      };
    })
    .filter((item) => item.label.length > 0);
}
