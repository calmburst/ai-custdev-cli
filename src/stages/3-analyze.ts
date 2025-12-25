import { promises as fs } from "fs";
import path from "path";
import { createObjectCsvWriter } from "csv-writer";
import { z } from "zod";

import type { IInterviewSession, IProjectConfig, OpenAIMessage } from "../types";
import { LlmClient } from "../core/LlmClient";
import { Logger } from "../core/Logger";
import { parseJsonFromText } from "../utils/json";
import { loadFallbackModels } from "../utils/fallback-models";
import { extractMessageText } from "../utils/llm";

type AnalysisRow = Record<string, string> & {
  personaId: string;
  segmentId: string;
};

const AnalysisValueSchema = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((value) => String(value));
const AnalysisRowSchema = z.record(z.string(), AnalysisValueSchema);

const buildJsonTemplate = (config: IProjectConfig): string => {
  const template: Record<string, string> = {};
  for (const metric of config.analyticsSchema) {
    template[metric.key] = "";
  }
  return JSON.stringify(template, null, 2);
};

const loadSessions = async (outputDir: string): Promise<IInterviewSession[]> => {
  const logDir = path.join(outputDir, "logs");
  const files = await fs.readdir(logDir);
  const sessions: IInterviewSession[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const raw = await fs.readFile(path.join(logDir, file), "utf-8");
    sessions.push(JSON.parse(raw) as IInterviewSession);
  }
  return sessions;
};

export const buildAnalyticsPrompt = (
  config: IProjectConfig,
  session: IInterviewSession
): string => {
  const fields = config.analyticsSchema
    .map((metric) => `- ${metric.key}: ${metric.description}`)
    .join("\n");

  const transcript = session.messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  return [
    "You are an analyst. Extract the following fields into a JSON object.",
    "Return ONLY valid JSON with string values for each key.",
    "If a field is unknown, return an empty string.",
    "Keep values concise (2-8 words). Use comma-separated lists for multiple items.",
    "Do not include markdown, tags, code fences, or extra commentary.",
    `All values must be written in the language: ${config.settings.lang}.`,
    "Keys must match the template exactly.",
    "If JSON is not possible, output plain text with one line per field in the form:",
    "key: value",
    "Use this exact JSON template and fill in values:",
    buildJsonTemplate(config),
    "",
    "Fields:",
    fields,
    "",
    "Transcript:",
    transcript,
  ].join("\n");
};

const normalizeRow = (
  parsed: Record<string, string>,
  config: IProjectConfig
): Record<string, string> => {
  const row: Record<string, string> = {};
  for (const metric of config.analyticsSchema) {
    row[metric.key] = parsed[metric.key] ?? "";
  }
  return row;
};

const parseAnalysisRow = (
  content: string,
  config: IProjectConfig
): Record<string, string> => {
  const sanitized = content
    .replace(/<\/?s>|\[\/?OUT]|\[\/?B_INST]/gi, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = parseJsonFromText<unknown>(sanitized);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse analysis JSON: ${message}`);
  }

  const result = AnalysisRowSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid analysis payload: ${result.error.message}`);
  }

  return normalizeRow(result.data, config);
};

const parseLooseAnalysisRow = (
  content: string,
  config: IProjectConfig
): Record<string, string> => {
  const sanitized = content
    .replace(/<\/?s>|\[\/?OUT]|\[\/?B_INST]/gi, "")
    .trim();
  const row: Record<string, string> = {};
  for (const metric of config.analyticsSchema) {
    const pattern = new RegExp(`${metric.key}\\s*[\\-—:=]\\s*(.+)`, "i");
    const match = sanitized.match(pattern);
    row[metric.key] = match ? match[1].trim() : "";
  }
  return row;
};

const hasAnyValue = (row: Record<string, string>): boolean =>
  Object.values(row).some((value) => value.trim().length > 0);

const enrichRow = (
  row: Record<string, string>,
  session: IInterviewSession
): AnalysisRow => {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    cleaned[key] = sanitizeValue(value);
  }
  return {
    personaId: session.personaId,
    segmentId: session.segmentId,
    ...cleaned,
  };
};

const sanitizeValue = (value: string): string => {
  let cleaned = value.replace(/\s+/g, " ").trim();
  const prefixPatterns = [
    /^Пользователь[^:]*:\s*/i,
    /^Из ответов[^:]*:\s*/i,
    /^В диалоге[^:]*:\s*/i,
    /^Критичные функции[^:]*:\s*/i,
    /^Основные риски[^:]*:\s*/i,
  ];
  for (const pattern of prefixPatterns) {
    cleaned = cleaned.replace(pattern, "");
  }
  if (cleaned.includes("->")) {
    cleaned = cleaned.split("->").pop()?.trim() ?? cleaned;
  }
  if (cleaned.includes(":")) {
    const parts = cleaned.split(":");
    const tail = parts[parts.length - 1].trim();
    if (tail.length > 0 && tail.length < cleaned.length) {
      cleaned = tail;
    }
  }
  if (cleaned.includes(".")) {
    const firstSentence = cleaned.split(".")[0].trim();
    if (firstSentence.length > 0 && firstSentence.length < cleaned.length) {
      cleaned = firstSentence;
    }
  }
  const quoteMatch =
    cleaned.match(/"([^"]{3,160})"/) ?? cleaned.match(/«([^»]{3,160})»/);
  if (quoteMatch?.[1]) {
    cleaned = quoteMatch[1].trim();
  }
  return cleaned;
};

const classifyYesNoMaybe = (value: string): "yes" | "no" | "maybe" | "unknown" => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  if (normalized.includes("нет")) {
    return "no";
  }
  if (normalized.includes("да")) {
    return "yes";
  }
  if (
    normalized.includes("возмож") ||
    normalized.includes("может") ||
    normalized.includes("после") ||
    normalized.includes("не уверен")
  ) {
    return "maybe";
  }
  return "unknown";
};

const splitItems = (value: string): string[] =>
  value
    .split(/[,;]\s*/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const topItems = (rows: AnalysisRow[], key: keyof AnalysisRow, limit = 3): string[] => {
  const counts = new Map<string, { count: number; label: string }>();
  for (const row of rows) {
    for (const item of splitItems(row[key] ?? "")) {
      const normalized = item.toLowerCase();
      const entry = counts.get(normalized);
      if (entry) {
        entry.count += 1;
      } else {
        counts.set(normalized, { count: 1, label: item });
      }
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((entry) => entry.label);
};

const buildSummary = (rows: AnalysisRow[], config: IProjectConfig) => {
  const total = rows.length;
  const perSegment: Record<
    string,
    {
      count: number;
      would_use: Record<string, number>;
      recommendation: Record<string, number>;
      top_needed_features: string[];
      top_trust_risks: string[];
      top_value_metrics: string[];
      personas: AnalysisRow[];
    }
  > = {};

  for (const row of rows) {
    const bucket = perSegment[row.segmentId] ?? {
      count: 0,
      would_use: {},
      recommendation: {},
      top_needed_features: [],
      top_trust_risks: [],
      top_value_metrics: [],
      personas: [],
    };
    bucket.count += 1;
    const wouldUseKey = classifyYesNoMaybe(row.would_use);
    bucket.would_use[wouldUseKey] = (bucket.would_use[wouldUseKey] ?? 0) + 1;
    const recommendationKey = classifyYesNoMaybe(row.recommendation);
    bucket.recommendation[recommendationKey] =
      (bucket.recommendation[recommendationKey] ?? 0) + 1;
    bucket.personas.push(row);
    perSegment[row.segmentId] = bucket;
  }

  for (const [segmentId, bucket] of Object.entries(perSegment)) {
    const segmentRows = bucket.personas;
    bucket.top_needed_features = topItems(segmentRows, "needed_features");
    bucket.top_trust_risks = topItems(segmentRows, "trust_risks");
    bucket.top_value_metrics = topItems(segmentRows, "value_metric");
    perSegment[segmentId] = bucket;
  }

  const segmentsSummary = config.segments.reduce<Record<string, number>>((acc, segment) => {
    acc[segment.id] = perSegment[segment.id]?.count ?? 0;
    return acc;
  }, {});

  return {
    project: config.meta.projectName,
    total_sessions: total,
    segments: segmentsSummary,
    per_segment: perSegment,
  };
};

const buildAnalysisMessages = (prompt: string, language: string): OpenAIMessage[] => {
  const isRussian = language.toLowerCase().startsWith("ru");
  const userPrompt = isRussian
    ? "Верни только JSON по шаблону. Без комментариев."
    : `Return only JSON in ${language}. No extra commentary.`;
  return [
    { role: "system", content: prompt },
    { role: "user", content: userPrompt },
  ];
};

const buildEmptyRow = (config: IProjectConfig): Record<string, string> =>
  normalizeRow({}, config);

const writeCsv = async (
  outputDir: string,
  rows: AnalysisRow[],
  config: IProjectConfig
): Promise<string> => {
  const filePath = path.join(outputDir, "analysis.csv");
  const headers = [
    { id: "personaId", title: "personaId" },
    { id: "segmentId", title: "segmentId" },
    ...config.analyticsSchema.map((metric) => ({
      id: metric.key,
      title: metric.key,
    })),
  ];
  const writer = createObjectCsvWriter({
    path: filePath,
    header: headers,
  });
  await writer.writeRecords(rows);
  return filePath;
};

const writeSummary = async (
  outputDir: string,
  rows: AnalysisRow[],
  config: IProjectConfig
): Promise<string> => {
  const summary = buildSummary(rows, config);
  const filePath = path.join(outputDir, "summary.json");
  await fs.writeFile(filePath, JSON.stringify(summary, null, 2), "utf-8");
  return filePath;
};

const requestAnalysisContent = async (
  client: LlmClient,
  prompt: string,
  model: string,
  logger: Logger,
  language: string
): Promise<string> => {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await client.createChatCompletion({
      model,
      messages: buildAnalysisMessages(prompt, language),
      temperature: 0,
      max_tokens: 250,
    });
    const content = extractMessageText(response.choices[0]?.message ?? null);
    if (content) {
      return content;
    }
    await logger.warn(
      `Analyzer response missing content for ${model} (attempt ${attempt}/${maxAttempts}).`
    );
  }
  return "";
};

export const analyzeInterviews = async (
  config: IProjectConfig,
  options: {
    outputDir?: string;
  } = {}
): Promise<AnalysisRow[]> => {
  const outputDir =
    options.outputDir ?? path.join(process.cwd(), "output", config.meta.projectName);
  const logger = new Logger(outputDir);
  const client = new LlmClient();

  const sessions = await loadSessions(outputDir);
  await logger.info(`Analyzing ${sessions.length} sessions...`);
  const fallback = await loadFallbackModels({
    primaryModel: config.models.analyzer,
  });
  if (fallback.models.length > 0) {
    await logger.info(
      `Analyzer fallback models (${fallback.source}): ${fallback.models.join(", ")}`
    );
  }

  const rows: AnalysisRow[] = [];
  for (const session of sessions) {
    const prompt = buildAnalyticsPrompt(config, session);
    const modelsToTry = [config.models.analyzer, ...fallback.models];
    let resolvedRow: Record<string, string> | null = null;
    let resolvedModel: string | null = null;

    for (const model of modelsToTry) {
      const content = await requestAnalysisContent(
        client,
        prompt,
        model,
        logger,
        config.settings.lang
      );
      if (!content) {
        await logger.warn(`Analyzer response missing for ${model}, trying fallback.`);
        continue;
      }

      try {
        resolvedRow = parseAnalysisRow(content, config);
        resolvedModel = model;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const looseRow = parseLooseAnalysisRow(content, config);
        if (hasAnyValue(looseRow)) {
          await logger.warn(`Analyzer fallback parse used for ${model}: ${message}`);
          resolvedRow = looseRow;
          resolvedModel = model;
          break;
        }
        await logger.warn(`Analyzer parse failed for ${model}, retrying once: ${message}`);
      }

      const retryPrompt = [
        prompt,
        "",
        "REMINDER: Respond ONLY with JSON matching the template. No extra text.",
      ].join("\n");
      const retryResponse = await client.createChatCompletion({
        model,
        messages: buildAnalysisMessages(retryPrompt, config.settings.lang),
        temperature: 0,
        max_tokens: 250,
      });
      const retryContent = extractMessageText(retryResponse.choices[0]?.message ?? null);
      if (!retryContent) {
        await logger.warn(`Analyzer retry response missing for ${model}.`);
        continue;
      }
      try {
        resolvedRow = parseAnalysisRow(retryContent, config);
        resolvedModel = model;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const looseRow = parseLooseAnalysisRow(retryContent, config);
        if (hasAnyValue(looseRow)) {
          await logger.warn(`Analyzer fallback parse used for ${model}: ${message}`);
          resolvedRow = looseRow;
          resolvedModel = model;
          break;
        }
        await logger.warn(`Analyzer retry parse failed for ${model}: ${message}`);
      }
    }

    if (!resolvedRow) {
      await logger.warn("Analyzer response missing after all fallbacks, writing empty row.");
      rows.push(enrichRow(buildEmptyRow(config), session));
      continue;
    }
    if (resolvedModel && resolvedModel !== config.models.analyzer) {
      await logger.info(
        `Analyzer fallback model used for ${session.personaId}: ${resolvedModel}`
      );
    }
    rows.push(enrichRow(resolvedRow, session));
  }

  const csvPath = await writeCsv(outputDir, rows, config);
  const summaryPath = await writeSummary(outputDir, rows, config);
  await logger.info(`Analysis complete. CSV saved to ${csvPath}`);
  await logger.info(`Summary saved to ${summaryPath}`);
  return rows;
};
