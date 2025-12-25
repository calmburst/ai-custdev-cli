import { promises as fs } from "fs";
import path from "path";
import pLimit from "p-limit";

import type { IInterviewSession, IPersona, IProjectConfig, OpenAIMessage } from "../types";
import { LlmClient } from "../core/LlmClient";
import { Logger } from "../core/Logger";
import { extractMessageText } from "../utils/llm";

const readPromptTemplate = async (filePath: string): Promise<string> =>
  fs.readFile(filePath, "utf-8");

class InterviewSession {
  private readonly client: LlmClient;
  private readonly respondentModel: string;
  private readonly interviewerModel: string;
  private readonly interviewScript: string[];
  private readonly respondentContext: string;
  private readonly respondentPrompt: string;
  private readonly interviewerPrompt: string;
  private readonly interviewerMode: "script" | "llm";
  private readonly persona: IPersona;
  private readonly segmentNotes: string[];
  private readonly logger: Logger;
  private readonly language: string;

  constructor(params: {
    client: LlmClient;
    respondentModel: string;
    interviewerModel: string;
    interviewScript: string[];
    respondentContext: string;
    respondentPrompt: string;
    interviewerPrompt: string;
    interviewerMode: "script" | "llm";
    persona: IPersona;
    segmentNotes: string[];
    logger: Logger;
    language: string;
  }) {
    this.client = params.client;
    this.respondentModel = params.respondentModel;
    this.interviewerModel = params.interviewerModel;
    this.interviewScript = params.interviewScript;
    this.respondentContext = params.respondentContext;
    this.respondentPrompt = params.respondentPrompt;
    this.interviewerPrompt = params.interviewerPrompt;
    this.interviewerMode = params.interviewerMode;
    this.persona = params.persona;
    this.segmentNotes = params.segmentNotes;
    this.logger = params.logger;
    this.language = params.language;
  }

  async run(): Promise<IInterviewSession> {
    const startedAt = new Date().toISOString();
    const sessionId = `${this.persona.id}-${startedAt}`.replace(/[:.]/g, "-");
    const messages: OpenAIMessage[] = [];
    const respondentSystem = this.buildRespondentSystem();
    const interviewerSystem = this.buildInterviewerSystem();

    for (const [index, step] of this.interviewScript.entries()) {
      await this.logger.info(
        `Interview ${this.persona.id} (${this.persona.segmentId}) question ${
          index + 1
        }/${this.interviewScript.length}.`
      );
      let interviewerContent = step;
      if (this.interviewerMode === "llm") {
        try {
          interviewerContent = await this.requestContent({
            label: "interviewer",
            model: this.interviewerModel,
            messages: [
              { role: "system", content: interviewerSystem },
              ...messages,
              { role: "user", content: `Следующий вопрос из скрипта: ${step}` },
            ],
            maxTokens: 120,
            retryPrompt: "Задай следующий вопрос одним предложением. Без комментариев.",
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          await this.logger.warn(
            `Interviewer fallback to script: ${message}`
          );
          interviewerContent = step;
        }
      }
      messages.push({ role: "user", content: interviewerContent });

      const respondentContent = await this.requestContent({
        label: "respondent",
        model: this.respondentModel,
        messages: [{ role: "system", content: respondentSystem }, ...messages],
        maxTokens: 160,
        retryPrompt: "Please answer directly in 1-3 sentences.",
        maxAttempts: 5,
      });
      messages.push({ role: "assistant", content: respondentContent });
    }

    const endedAt = new Date().toISOString();
    const session: IInterviewSession = {
      id: sessionId,
      projectName: "",
      personaId: this.persona.id,
      segmentId: this.persona.segmentId,
      startedAt,
      endedAt,
      messages,
    };
    await this.logger.info(
      `Interview completed for persona ${this.persona.id} (${this.persona.segmentId}).`
    );
    return session;
  }

  private async requestContent(params: {
    label: string;
    model: string;
    messages: OpenAIMessage[];
    maxTokens?: number;
    retryPrompt?: string;
    maxAttempts?: number;
  }): Promise<string> {
    const maxAttempts = params.maxAttempts ?? 3;
    let attempt = 0;

    while (attempt < maxAttempts) {
      const messages =
        attempt === 0 || !params.retryPrompt
          ? params.messages
          : [
              ...params.messages,
              { role: "user" as const, content: params.retryPrompt },
            ];
      const response = await this.client.createChatCompletion({
        model: params.model,
        messages,
        max_tokens: params.maxTokens,
      });
      const content = extractMessageText(response.choices[0]?.message ?? null);
      const cleaned = content ? this.sanitizeContent(content) : "";
      if (cleaned) {
        return cleaned;
      }
      attempt += 1;
      await this.logger.warn(
        `${params.label} response missing content (attempt ${attempt}/${maxAttempts}).`
      );
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw new Error(`${params.label} response missing.`);
  }

  private sanitizeContent(content: string): string {
    return content
      .replace(/<\/?s>|\[\/?OUT]|\[\/?B_INST]/gi, "")
      .trim();
  }

  private buildRespondentSystem(): string {
    return [
      this.respondentPrompt.trim(),
      "",
      this.respondentContext.trim(),
      "",
      `Language: ${this.language}`,
      "Respond only in this language.",
      `Persona: ${this.persona.name}`,
      `Bio: ${this.persona.bio}`,
      `Hidden traits: ${this.persona.hiddenTraits.join(", ")}`,
      ...(this.segmentNotes.length > 0
        ? ["Segment hints:", ...this.segmentNotes]
        : []),
    ].join("\n");
  }

  private buildInterviewerSystem(): string {
    return [
      this.interviewerPrompt.trim(),
      "",
      `Language: ${this.language}`,
      "Ask the next question in this language only.",
      "Script steps:",
      ...this.interviewScript.map((step, index) => `${index + 1}. ${step}`),
    ].join("\n");
  }
}

const writeSession = async (outputDir: string, session: IInterviewSession): Promise<void> => {
  const logDir = path.join(outputDir, "logs");
  await fs.mkdir(logDir, { recursive: true });
  const filePath = path.join(logDir, `${session.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), "utf-8");
};

const loadPersonas = async (outputDir: string): Promise<IPersona[]> => {
  const filePath = path.join(outputDir, "personas.json");
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as IPersona[];
};

const loadCompletedPersonaIds = async (outputDir: string): Promise<Set<string>> => {
  const logDir = path.join(outputDir, "logs");
  try {
    const files = await fs.readdir(logDir);
    const completed = new Set<string>();
    for (const file of files) {
      if (!file.endsWith(".json")) {
        continue;
      }
      const raw = await fs.readFile(path.join(logDir, file), "utf-8");
      const session = JSON.parse(raw) as IInterviewSession;
      if (session.personaId) {
        completed.add(session.personaId);
      }
    }
    return completed;
  } catch {
    return new Set<string>();
  }
};

export const simulateInterviews = async (
  config: IProjectConfig,
  options: {
    outputDir?: string;
    respondentPromptPath?: string;
    interviewerPromptPath?: string;
    interviewerMode?: "script" | "llm";
  } = {}
): Promise<IInterviewSession[]> => {
  const outputDir =
    options.outputDir ?? path.join(process.cwd(), "output", config.meta.projectName);
  const respondentPromptPath =
    options.respondentPromptPath ??
    path.join(process.cwd(), "input", "prompt-respondent.txt");
  const interviewerPromptPath =
    options.interviewerPromptPath ??
    path.join(process.cwd(), "input", "prompt-interviewer.txt");
  const interviewerMode =
    options.interviewerMode ?? config.interviewFlow.interviewerMode ?? "script";
  const respondentPrompt = await readPromptTemplate(respondentPromptPath);
  const interviewerPrompt = await readPromptTemplate(interviewerPromptPath);
  const logger = new Logger(outputDir);
  const client = new LlmClient();
  const limit = pLimit(config.settings.concurrency);
  const personas = await loadPersonas(outputDir);
  const completedPersonaIds = await loadCompletedPersonaIds(outputDir);
  const segmentById = new Map(config.segments.map((segment) => [segment.id, segment]));
  const pendingPersonas = personas.filter(
    (persona) => !completedPersonaIds.has(persona.id)
  );

  await logger.info(
    `Simulating ${pendingPersonas.length} interviews (skipping ${completedPersonaIds.size}).`
  );

  const tasks = pendingPersonas.map((persona) =>
    limit(async () => {
      const segment = segmentById.get(persona.segmentId);
      const segmentNotes: string[] = [];
      if (segment?.tooling?.length) {
        segmentNotes.push(`Preferred tools: ${segment.tooling.join(", ")}`);
      }
      if (segment?.painPoints?.length) {
        segmentNotes.push(`Common pain points: ${segment.painPoints.join(", ")}`);
      }
      if (segment?.cadence) {
        segmentNotes.push(`Typical cadence: ${segment.cadence}`);
      }
      const sessionRunner = new InterviewSession({
        client,
        respondentModel: config.models.respondent,
        interviewerModel: config.models.interviewer,
        interviewScript: config.interviewFlow.script,
        respondentContext: config.interviewFlow.context,
        respondentPrompt,
        interviewerPrompt,
        interviewerMode,
        persona,
        segmentNotes,
        logger,
        language: config.settings.lang,
      });
      const session = await sessionRunner.run();
      session.projectName = config.meta.projectName;
      await writeSession(outputDir, session);
      return session;
    })
  );

  const results = await Promise.all(tasks);
  await logger.info(`Simulation finished: ${results.length} interviews saved.`);
  return results;
};
