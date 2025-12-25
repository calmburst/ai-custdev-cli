import { Command } from "commander";
import path from "path";

import { ConfigLoader } from "./core/ConfigLoader";
import { LlmClient } from "./core/LlmClient";
import { generatePersonas } from "./stages/1-generate";
import { simulateInterviews } from "./stages/2-simulate";
import { analyzeInterviews } from "./stages/3-analyze";
import { buildRunLabel, formatRunTimestamp } from "./utils/run-naming";
import { generateRunName } from "./utils/run-name";
import { buildRunEstimate, formatCost, formatDuration } from "./utils/estimates";
import { ProgressTracker, setProgressTracker } from "./utils/progress";
import { generateOptimizationAdvice } from "./stages/4-advice";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DEFAULT_RUN_NAME_MODEL = "mistralai/mistral-7b-instruct:free";

const run = async (): Promise<void> => {
  const program = new Command();
  program
    .name("ai-custdev-cli")
    .description("AI-powered customer development CLI")
    .requiredOption("-p, --project <name>", "Project config name in config/projects/")
    .option("--skip-generate", "Skip persona generation")
    .option("--skip-simulate", "Skip interview simulation")
    .option("--skip-analyze", "Skip analysis step")
    .option(
      "--output <dir>",
      "Override output root directory",
      (value) => path.resolve(value)
    )
    .option("--run-name <name>", "Explicit run name for the output subfolder")
    .option(
      "--run-tag <tag>",
      "Add a run tag (repeatable)",
      (value: string, previous: string[] | undefined) =>
        previous ? [...previous, value] : [value]
    )
    .option("--run-name-auto", "Generate a run name via LLM")
    .option("--run-name-model <model>", "Model to use for run name generation")
    .option(
      "--interviewer-mode <mode>",
      "Interviewer mode: script or llm"
    )
    .option("--lang <lang>", "Override language for all outputs")
    .option("--yes", "Skip confirmation prompt")
    .option("--check-key", "Check OpenRouter key status before run")
    .option("--skip-advice", "Skip post-run optimization advice")
    .option("--advice-model <model>", "Model to use for optimization advice")
    .parse(process.argv);

  const options = program.opts<{
    project: string;
    skipGenerate?: boolean;
    skipSimulate?: boolean;
    skipAnalyze?: boolean;
    output?: string;
    runName?: string;
    runTag?: string[];
    runNameAuto?: boolean;
    runNameModel?: string;
    interviewerMode?: "script" | "llm";
    lang?: string;
    yes?: boolean;
    checkKey?: boolean;
    skipAdvice?: boolean;
    adviceModel?: string;
  }>();

  const config = await ConfigLoader.loadProjectConfig(options.project);
  const lang = options.lang ?? config.settings.lang ?? "ru";
  const resolvedConfig = {
    ...config,
    settings: {
      ...config.settings,
      lang,
    },
  };
  const interviewerMode =
    options.interviewerMode ?? resolvedConfig.interviewFlow.interviewerMode ?? "script";
  if (interviewerMode !== "script" && interviewerMode !== "llm") {
    throw new Error(
      `Invalid interviewer mode "${interviewerMode}". Use "script" or "llm".`
    );
  }
  const outputRoot = options.output ?? path.join(process.cwd(), "output");
  const projectOutputRoot = path.join(outputRoot, resolvedConfig.meta.projectName);

  const runTags = options.runTag ?? [];
  let runName = options.runName;

  if (!runName && options.runNameAuto) {
    try {
      const client = new LlmClient();
      runName = await generateRunName({
        client,
        config: resolvedConfig,
        tags: runTags,
        model:
          options.runNameModel ??
          process.env.RUN_NAME_MODEL ??
          DEFAULT_RUN_NAME_MODEL,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Run name generation failed, using timestamp only: ${message}`);
    }
  }

  const runLabel = buildRunLabel({
    timestamp: formatRunTimestamp(new Date()),
    runName,
    tags: runTags,
  });
  const outputDir = path.join(projectOutputRoot, runLabel);

  const estimate = await buildRunEstimate({
    config: resolvedConfig,
    interviewerMode,
    runNameAuto: Boolean(options.runNameAuto),
    runNameModel: options.runNameModel ?? resolvedConfig.models.generator,
    includeGenerate: !options.skipGenerate,
    includeSimulate: !options.skipSimulate,
    includeAnalyze: !options.skipAnalyze,
    includeAdvice: !options.skipAdvice,
  });

  console.log("");
  console.log("Параметры запуска:");
  console.log(`- project: ${resolvedConfig.meta.projectName}`);
  console.log(`- description: ${resolvedConfig.meta.description}`);
  console.log(`- iterations: ${resolvedConfig.settings.iterations}`);
  console.log(`- concurrency: ${resolvedConfig.settings.concurrency}`);
  console.log(`- lang: ${resolvedConfig.settings.lang}`);
  console.log(`- interviewerMode: ${interviewerMode}`);
  console.log(`- outputDir: ${outputDir}`);
  console.log(`- models:`);
  console.log(`  - generator: ${resolvedConfig.models.generator}`);
  console.log(`  - respondent: ${resolvedConfig.models.respondent}`);
  console.log(`  - interviewer: ${resolvedConfig.models.interviewer}`);
  console.log(`  - analyzer: ${resolvedConfig.models.analyzer}`);
  console.log(
    `  - advisor: ${resolvedConfig.models.advisor ?? "deepseek/deepseek-r1-0528:free"}`
  );
  console.log("");
  console.log("Оценка запуска:");
  console.log(`- requests: ${estimate.requests.total} (gen ${estimate.requests.generator}, sim ${estimate.requests.simulate}, analyze ${estimate.requests.analyze}, advice ${estimate.requests.advice}, runName ${estimate.requests.runName})`);
  console.log(`- tokens: ~${estimate.tokens.total} (in ~${estimate.tokens.input}, out ~${estimate.tokens.output})`);
  console.log(`- duration: ~${formatDuration(estimate.timeSeconds)}`);
  console.log(`- cost: ${formatCost(estimate.cost)}${estimate.cost.note ? ` (${estimate.cost.note})` : ""}`);
  console.log(`- notes: ${estimate.notes.join(" ")}`);
  console.log("");

  if (options.checkKey) {
    try {
      const client = new LlmClient();
      const status = await client.getKeyStatus();
      console.log("OpenRouter key status:");
      if (status.label) {
        console.log(`- label: ${status.label}`);
      }
      if (status.usage?.total_requests !== undefined) {
        console.log(`- total_requests: ${status.usage.total_requests}`);
      }
      if (status.usage?.total_tokens !== undefined) {
        console.log(`- total_tokens: ${status.usage.total_tokens}`);
      }
      if (status.limits?.remaining !== undefined) {
        console.log(`- remaining: ${status.limits.remaining}`);
      }
      if (status.data && Object.keys(status.data).length > 0) {
        console.log("- details:");
        console.log(JSON.stringify(status.data, null, 2));
      }
      console.log("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Key status check failed: ${message}`);
      console.log("");
    }
  }

  if (!options.yes) {
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question("Запустить прогон? (y/N): ");
    rl.close();
    const normalized = answer.trim().toLowerCase();
    if (normalized !== "y" && normalized !== "yes") {
      console.log("Запуск отменен.");
      return;
    }
  }

  const runNameAlreadyUsed = Boolean(options.runNameAuto);
  const progressTotal = Math.max(
    0,
    estimate.requests.total - (runNameAlreadyUsed ? 1 : 0)
  );
  const tracker = progressTotal > 0 ? new ProgressTracker(progressTotal, "Progress") : null;
  if (tracker) {
    setProgressTracker(tracker);
  }

  if (!options.skipGenerate) {
    await generatePersonas(resolvedConfig, { outputDir });
  }
  if (!options.skipSimulate) {
    await simulateInterviews(resolvedConfig, { outputDir, interviewerMode });
  }
  if (!options.skipAnalyze) {
    await analyzeInterviews(resolvedConfig, { outputDir });
  }
  if (!options.skipAdvice) {
    if (options.skipAnalyze) {
      console.warn("Advice skipped because analyze stage was skipped.");
    } else {
      await generateOptimizationAdvice(resolvedConfig, {
        outputDir,
        model: options.adviceModel,
      });
    }
  }
  if (tracker) {
    tracker.complete();
    setProgressTracker(null);
  }
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
