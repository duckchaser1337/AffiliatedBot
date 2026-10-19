export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Palavras que não podem terminar um título cortado ("... 360° Universal Para").
const DANGLING_WORDS = new Set([
  "para", "com", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "nos", "nas",
  "sem", "ou", "a", "o", "ao", "p/", "c/", "-", "–", "+", "|", "/", "&",
]);

// Título enxuto pros posts: as primeiras palavras até o limite, sem reticências e sem
// terminar em conector. Títulos de marketplace costumam pôr o essencial no começo e
// encher o resto de palavra-chave de busca ("Para Carro Painel Vidro Mesa E...").
export function productHeadline(title: string, max: number): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;

  const kept: string[] = [];
  for (const word of clean.split(" ")) {
    if ([...kept, word].join(" ").length > max) break;
    kept.push(word);
  }
  while (kept.length > 1 && DANGLING_WORDS.has(kept[kept.length - 1].toLowerCase().replace(/[,;:.]+$/, ""))) {
    kept.pop();
  }
  // Uma única palavra maior que o limite: corta no meio mesmo.
  return kept.length > 0 ? kept.join(" ").replace(/[\s,;:]+$/, "") : clean.slice(0, max);
}
