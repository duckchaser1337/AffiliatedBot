import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Product } from "../sources/types.js";

// Minúsculas, sem acento e sem pontuação: assim "Anti-Radar" casa com o termo "anti radar".
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const termList = z.array(z.string().refine((term) => normalize(term).length > 0, "termo vazio"));

const nicheSchema = z.object({
  // Nunca publica: itens ilegais ou fora do nicho.
  blockedTerms: termList,
  // Itens de segurança: só publica quando vêm de loja oficial.
  officialStoreOnlyTerms: termList,
});

export type NicheRules = z.infer<typeof nicheSchema>;

export interface NicheCheck {
  allowed: boolean;
  reason?: string;
}

// Casa palavras inteiras: "pivo" pega "Pivô de Suspensão", mas não "Suporte Pivotante".
function findTerm(title: string, terms: readonly string[]): string | undefined {
  const padded = ` ${normalize(title)} `;
  return terms.find((term) => padded.includes(` ${normalize(term)} `));
}

export function checkNiche(product: Product, rules: NicheRules): NicheCheck {
  const blocked = findTerm(product.title, rules.blockedTerms);
  if (blocked) {
    return { allowed: false, reason: `termo bloqueado: "${blocked}"` };
  }
  const restricted = findTerm(product.title, rules.officialStoreOnlyTerms);
  if (restricted && !product.officialStore) {
    return { allowed: false, reason: `"${restricted}" só é publicado de loja oficial` };
  }
  return { allowed: true };
}

export async function loadNicheRules(filePath: string): Promise<NicheRules> {
  const contents = await readFile(filePath, "utf8");
  return nicheSchema.parse(JSON.parse(contents));
}
