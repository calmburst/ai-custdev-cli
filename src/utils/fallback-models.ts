import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";

const DEFAULT_FALLBACK_MODELS = [
  "mistralai/mistral-7b-instruct:free",
  "deepseek/deepseek-r1-0528:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "google/gemma-2-9b-it:free",
  "qwen/qwen-2.5-7b-instruct:free",
];

const ModelsArraySchema = z.array(z.string().min(1)).min(1);
const ModelsConfigSchema = z.object({ models: ModelsArraySchema });

const normalizeModels = (models: string[], primaryModel?: string): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const model of models) {
    const trimmed = model.trim();
    if (!trimmed || trimmed === primaryModel) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
};

export const loadFallbackModels = async (options: {
  filePath?: string;
  primaryModel?: string;
} = {}): Promise<{ models: string[]; source: "file" | "default" }> => {
  const filePath =
    options.filePath ?? path.join(process.cwd(), "config", "fallback-models.json");

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const listResult = ModelsArraySchema.safeParse(parsed);
    const configResult = ModelsConfigSchema.safeParse(parsed);
    const models = listResult.success
      ? listResult.data
      : configResult.success
      ? configResult.data.models
      : null;
    if (!models) {
      throw new Error("Fallback models config must be an array or {\"models\": []}.");
    }
    return {
      models: normalizeModels(models, options.primaryModel),
      source: "file",
    };
  } catch {
    return {
      models: normalizeModels(DEFAULT_FALLBACK_MODELS, options.primaryModel),
      source: "default",
    };
  }
};
