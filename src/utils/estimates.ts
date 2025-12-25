import type {IProjectConfig} from "../types";

type InterviewerMode = "script" | "llm";

type RequestEstimate = {
  generator: number;
  simulate: number;
  analyze: number;
  advice: number;
  runName: number;
  total: number;
};

type TokenEstimate = {
  input: number;
  output: number;
  total: number;
};

type CostEstimate = {
  currency: "USD";
  total: number | null;
  perModel: Record<string, number | null>;
  note?: string;
};

export type RunEstimate = {
  requests: RequestEstimate;
  tokens: TokenEstimate;
  timeSeconds: number;
  cost: CostEstimate;
  notes: string[];
};

const AVG_TOKENS = {
  generatorInput: 900,
  generatorOutputPerPersona: 160,
  interviewerInput: 220,
  interviewerOutput: 40,
  respondentInput: 320,
  respondentOutput: 120,
  analyzerInput: 520,
  analyzerOutput: 120,
  adviceInput: 800,
  adviceOutput: 200,
  runNameInput: 120,
  runNameOutput: 10,
};

const MODEL_PRICING: Record<
  string,
  { inputPerMillion: number; outputPerMillion: number }
> = {
  "mistralai/mistral-7b-instruct:free": { inputPerMillion: 0, outputPerMillion: 0 },
  "deepseek/deepseek-r1-0528:free": { inputPerMillion: 0, outputPerMillion: 0 },
};

const estimateCost = (params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number | null => {
  const pricing = MODEL_PRICING[params.model];
  if (!pricing) {
    return null;
  }
  const inputCost = (params.inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (params.outputTokens / 1_000_000) * pricing.outputPerMillion;
  return inputCost + outputCost;
};

export const buildRunEstimate = async (params: {
  config: IProjectConfig;
  interviewerMode: InterviewerMode;
  runNameAuto: boolean;
  runNameModel?: string;
  includeGenerate: boolean;
  includeSimulate: boolean;
  includeAnalyze: boolean;
  includeAdvice: boolean;
}): Promise<RunEstimate> => {
  const personas = params.includeSimulate ? params.config.settings.iterations : 0;
  const steps = params.config.interviewFlow.script.length;
  const interviewerRequests =
    params.interviewerMode === "llm" ? personas * steps : 0;
  const respondentRequests = personas * steps;

  const generatorRequests = params.includeGenerate ? 1 : 0;
  const simulateRequests =
    params.includeSimulate ? interviewerRequests + respondentRequests : 0;
  const analyzeRequests = params.includeAnalyze ? personas : 0;
  const adviceRequests = params.includeAdvice ? 1 : 0;
  const runNameRequests = params.runNameAuto ? 1 : 0;

  const totalRequests =
    generatorRequests +
    simulateRequests +
    analyzeRequests +
    adviceRequests +
    runNameRequests;

  const generatorInput = generatorRequests * AVG_TOKENS.generatorInput;
  const generatorOutput =
    generatorRequests * AVG_TOKENS.generatorOutputPerPersona * personas;

  const interviewerInput = interviewerRequests * AVG_TOKENS.interviewerInput;
  const interviewerOutput = interviewerRequests * AVG_TOKENS.interviewerOutput;
  const respondentInput = respondentRequests * AVG_TOKENS.respondentInput;
  const respondentOutput = respondentRequests * AVG_TOKENS.respondentOutput;

  const analyzerInput = analyzeRequests * AVG_TOKENS.analyzerInput;
  const analyzerOutput = analyzeRequests * AVG_TOKENS.analyzerOutput;

  const adviceInput = adviceRequests * AVG_TOKENS.adviceInput;
  const adviceOutput = adviceRequests * AVG_TOKENS.adviceOutput;

  const runNameInput = runNameRequests * AVG_TOKENS.runNameInput;
  const runNameOutput = runNameRequests * AVG_TOKENS.runNameOutput;

  const inputTokens =
    generatorInput +
    interviewerInput +
    respondentInput +
    analyzerInput +
    adviceInput +
    runNameInput;
  const outputTokens =
    generatorOutput +
    interviewerOutput +
    respondentOutput +
    analyzerOutput +
    adviceOutput +
    runNameOutput;

  const tokens = {
    input: Math.round(inputTokens),
    output: Math.round(outputTokens),
    total: Math.round(inputTokens + outputTokens),
  };

  const avgLatencySeconds = 3.2;
  const concurrency = Math.max(1, params.config.settings.concurrency);
  const timeSeconds = Math.round((totalRequests / concurrency) * avgLatencySeconds);

  const perModelCosts: Record<string, number | null> = {};
  const models = params.config.models;
  perModelCosts[models.generator] = estimateCost({
    model: models.generator,
    inputTokens: generatorInput,
    outputTokens: generatorOutput,
  });

  perModelCosts[models.respondent] = estimateCost({
    model: models.respondent,
    inputTokens: respondentInput,
    outputTokens: respondentOutput,
  });

  perModelCosts[models.interviewer] = estimateCost({
    model: models.interviewer,
    inputTokens: interviewerInput,
    outputTokens: interviewerOutput,
  });

  perModelCosts[models.analyzer] = estimateCost({
    model: models.analyzer,
    inputTokens: analyzerInput,
    outputTokens: analyzerOutput,
  });

  const adviceModel = models.advisor ?? "deepseek/deepseek-r1-0528:free";
  perModelCosts[adviceModel] = estimateCost({
    model: adviceModel,
    inputTokens: adviceInput,
    outputTokens: adviceOutput,
  });

  const runNameModel = params.runNameModel ?? models.generator;
  perModelCosts[runNameModel] = estimateCost({
    model: runNameModel,
    inputTokens: runNameInput,
    outputTokens: runNameOutput,
  });

  const totalCostKnown = Object.values(perModelCosts).every(
    (value) => value !== null
  );
  const totalCost = totalCostKnown
    ? Object.values(perModelCosts).reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;

  const notes: string[] = [
    "Оценка токенов приблизительная, зависит от фактической длины ответов.",
    "Оценка времени основана на средней задержке и параллелизме.",
  ];

  return {
    requests: {
      generator: generatorRequests,
      simulate: simulateRequests,
      analyze: analyzeRequests,
      advice: adviceRequests,
      runName: runNameRequests,
      total: totalRequests,
    },
    tokens,
    timeSeconds,
    cost: {
      currency: "USD",
      total: totalCost,
      perModel: perModelCosts,
      note: totalCostKnown ? undefined : "Стоимость для части моделей неизвестна.",
    },
    notes,
  };
};

export const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes <= 0) {
    return `${remaining}s`;
  }
  return `${minutes}m ${remaining}s`;
};

export const formatCost = (cost: CostEstimate): string => {
  if (cost.total === null) {
    return "unknown";
  }
  return `${cost.total.toFixed(4)} ${cost.currency}`;
};
