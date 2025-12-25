import { promises as fs } from "fs";
import path from "path";

import type { IProjectConfig } from "../types";
import { LlmClient } from "../core/LlmClient";
import { Logger } from "../core/Logger";
import { extractMessageText } from "../utils/llm";

const DEFAULT_ADVICE_MODEL = "deepseek/deepseek-r1-0528:free";

const buildAdvicePrompt = (params: {
  config: IProjectConfig;
  summary: unknown;
  analysisPreview: string;
}): string => {
  const language = params.config.settings.lang;
  const isRussian = language.toLowerCase().startsWith("ru");
  const configSummary = {
    meta: params.config.meta,
    settings: params.config.settings,
    segments: params.config.segments,
    interviewFlow: {
      context: params.config.interviewFlow.context,
      script: params.config.interviewFlow.script,
      interviewerMode: params.config.interviewFlow.interviewerMode ?? "script",
    },
    analyticsSchema: params.config.analyticsSchema,
    models: params.config.models,
  };

  const intro = isRussian
    ? [
        "Ты консультант по CustDev. Оцени результаты и предложи улучшения.",
        "Ответ должен быть кратким, структурированным, на русском.",
        "Дай 5-10 конкретных изменений в параметрах запуска (сегменты, веса, вопросы, схема аналитики, итерации, режим интервьюера, модели).",
        "Если видно слабые места (мало сигналов, шум), укажи их.",
      ]
    : [
        "You are a CustDev consultant. Review the results and propose improvements.",
        `Respond concisely and in ${language}.`,
        "Provide 5-10 concrete changes to run parameters (segments, weights, questions, analytics schema, iterations, interviewer mode, models).",
        "If you see weak signals or noise, call them out.",
      ];

  const labels = isRussian
    ? {
        runParams: "Параметры запуска:",
        summary: "Summary.json:",
        analysis: "Фрагмент analysis.csv:",
      }
    : {
        runParams: "Run parameters:",
        summary: "Summary.json:",
        analysis: "Analysis.csv excerpt:",
      };

  return [
    ...intro,
    "",
    labels.runParams,
    JSON.stringify(configSummary, null, 2),
    "",
    labels.summary,
    JSON.stringify(params.summary, null, 2),
    "",
    labels.analysis,
    params.analysisPreview,
  ].join("\n");
};

export const generateOptimizationAdvice = async (
  config: IProjectConfig,
  options: {
    outputDir?: string;
    model?: string;
  } = {}
): Promise<string> => {
  const outputDir =
    options.outputDir ?? path.join(process.cwd(), "output", config.meta.projectName);
  const logger = new Logger(outputDir);
  const model = options.model ?? config.models.advisor ?? DEFAULT_ADVICE_MODEL;
  const summaryPath = path.join(outputDir, "summary.json");
  const analysisPath = path.join(outputDir, "analysis.csv");

  const [summaryRaw, analysisRaw] = await Promise.all([
    fs.readFile(summaryPath, "utf-8"),
    fs.readFile(analysisPath, "utf-8"),
  ]);

  const summary = JSON.parse(summaryRaw) as unknown;
  const analysisPreview = analysisRaw
    .split(/\r?\n/)
    .slice(0, 12)
    .join("\n");

  const prompt = buildAdvicePrompt({
    config,
    summary,
    analysisPreview,
  });

  await logger.info("Requesting optimization advice...");
  const client = new LlmClient();
  const response = await client.createChatCompletion({
    model,
    messages: [{ role: "system", content: prompt }],
    temperature: 0.2,
    max_tokens: 500,
  });

  const content = extractMessageText(response.choices[0]?.message ?? null);
  if (!content) {
    throw new Error("Advice response missing.");
  }

  const outputPath = path.join(outputDir, "advice.md");
  await fs.writeFile(outputPath, content.trim(), "utf-8");
  await logger.info(`Advice saved to ${outputPath}`);
  return outputPath;
};
