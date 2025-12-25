import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";

import type { IPersona, IProjectConfig } from "../types";
import { LlmClient } from "../core/LlmClient";
import { Logger } from "../core/Logger";
import { allocateCountsByWeight } from "../utils/allocations";
import { parseJsonFromText } from "../utils/json";
import { extractMessageText } from "../utils/llm";

const StringLike = z.union([z.string(), z.number()]).transform((value) => String(value));

const HiddenTraitsSchema = z
  .union([z.array(z.string()), z.string()])
  .transform((value) => {
    const items = Array.isArray(value) ? value : value.split(/[,;]\s*/);
    return items.map((item) => item.trim()).filter((item) => item.length > 0);
  })
  .refine((items) => items.length > 0, "hiddenTraits must have at least one entry");

const PersonaSchema = z.object({
  id: StringLike,
  segmentId: StringLike,
  name: z.string().min(1),
  age: z.number().int().positive(),
  occupation: z.string().min(1),
  bio: z.string().min(1),
  hiddenTraits: HiddenTraitsSchema,
});

const PersonasSchema = z.array(PersonaSchema).min(1);

const formatSegmentPlan = (
  segments: IProjectConfig["segments"],
  counts: Map<string, number>
): string =>
  segments
    .map((segment) => {
      const count = counts.get(segment.id) ?? 0;
      const tooling = segment.tooling?.length
        ? `; tools: ${segment.tooling.join(", ")}`
        : "";
      const painPoints = segment.painPoints?.length
        ? `; pain points: ${segment.painPoints.join(", ")}`
        : "";
      const cadence = segment.cadence ? `; cadence: ${segment.cadence}` : "";
      return `- ${segment.id} (${segment.name}): ${count} personas; traits: ${segment.traits.join(
        ", "
      )}${tooling}${painPoints}${cadence}`;
    })
    .join("\n");

const readPromptTemplate = async (filePath: string): Promise<string> =>
  fs.readFile(filePath, "utf-8");

const buildPrompt = (
  template: string,
  config: IProjectConfig,
  segmentPlan: string
): string => {
  const today = new Date().toISOString().slice(0, 10);
  return [
    template.trim(),
    "",
    `Project: ${config.meta.projectName}`,
    `Description: ${config.meta.description}`,
    `Date: ${today}`,
    `Language: ${config.settings.lang}`,
    "Write all persona text fields in the specified language.",
    "",
    "Generate personas strictly as JSON array of objects with fields:",
    "id, segmentId, name, age, occupation, bio, hiddenTraits.",
    "Use string IDs like \"p-001\" and segmentId must match the segment id.",
    "hiddenTraits must be an array of strings.",
    "",
    "Segments and counts:",
    segmentPlan,
  ].join("\n");
};

const parsePersonas = (content: string): IPersona[] => {
  let parsed: unknown;
  try {
    parsed = parseJsonFromText<unknown>(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse persona JSON: ${message}`);
  }

  let normalized: unknown = parsed;
  if (parsed && typeof parsed === "object") {
    const candidate = parsed as Record<string, unknown>;
    const directKeys = ["personas", "data", "items", "results"];
    for (const key of directKeys) {
      const value = candidate[key];
      if (Array.isArray(value)) {
        normalized = value;
        break;
      }
    }
    if (!Array.isArray(normalized)) {
      const arrayEntries = Object.entries(candidate).filter(([, value]) =>
        Array.isArray(value)
      );
      if (arrayEntries.length === 1) {
        normalized = arrayEntries[0][1];
      }
    }
  }

  const result = PersonasSchema.safeParse(normalized);
  if (!result.success) {
    throw new Error(`Invalid persona payload: ${result.error.message}`);
  }

  return result.data;
};

export const generatePersonas = async (
  config: IProjectConfig,
  options: {
    promptPath?: string;
    outputDir?: string;
  } = {}
): Promise<IPersona[]> => {
  const promptPath =
    options.promptPath ?? path.join(process.cwd(), "input", "prompt-generator.txt");
  const outputDir =
    options.outputDir ?? path.join(process.cwd(), "output", config.meta.projectName);
  const logger = new Logger(outputDir);

  const segmentCounts = allocateCountsByWeight(config.segments, config.settings.iterations);
  const template = await readPromptTemplate(promptPath);
  const prompt = buildPrompt(template, config, formatSegmentPlan(config.segments, segmentCounts));

  await logger.info("Generating personas...");

  const client = new LlmClient();
  const response = await client.createChatCompletion({
    model: config.models.generator,
    messages: [{ role: "system", content: prompt }],
    temperature: 0.8,
  });

  const message = extractMessageText(response.choices[0]?.message ?? null);
  if (!message) {
    throw new Error("LLM response did not include any content.");
  }

  const personas = parsePersonas(message);
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "personas.json");
  await fs.writeFile(outputPath, JSON.stringify(personas, null, 2), "utf-8");
  await logger.info(`Saved ${personas.length} personas to ${outputPath}`);

  return personas;
};
