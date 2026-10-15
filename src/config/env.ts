import { z } from "zod";
import { CHANNEL_IDS } from "../channels/types.js";
import { SOURCE_IDS } from "../sources/types.js";

// Lista separada por vírgula (ex: "shopee,mercadolivre"). Vazio cai no padrão, porque
// o GitHub Actions entrega "" quando a variável do repositório não foi cadastrada.
function idList<T extends string>(ids: readonly [T, ...T[]], fallback: [T, ...T[]]) {
  return z
    .string()
    .optional()
    .transform((value) => [
      ...new Set(
        (value ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ])
    .transform((list) => (list.length > 0 ? list : fallback))
    .pipe(z.array(z.enum(ids)).nonempty());
}

const settingsSchema = z.object({
  SOURCES: idList(SOURCE_IDS, ["mercadolivre"]),
  CHANNELS: idList(CHANNEL_IDS, ["telegram"]),
  DISCOUNT_THRESHOLD_PERCENT: z.coerce.number().positive().default(15),
});

export type Settings = z.infer<typeof settingsSchema>;

// Cada fonte e canal valida só as próprias variáveis, e só quando está ligado.
export function parseEnv<T extends z.ZodTypeAny>(schema: T, source: NodeJS.ProcessEnv = process.env): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Configuração inválida:\n${issues}`);
  }
  return result.data;
}

export function loadSettings(source: NodeJS.ProcessEnv = process.env): Settings {
  return parseEnv(settingsSchema, source);
}
