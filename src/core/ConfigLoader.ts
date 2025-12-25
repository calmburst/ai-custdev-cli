import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";

import type { IProjectConfig } from "../types";

const SegmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  weight: z.number().min(0).max(1),
  traits: z.array(z.string()),
  tooling: z.array(z.string()).min(1).optional(),
  painPoints: z.array(z.string()).min(1).optional(),
  cadence: z.string().min(1).optional(),
});

const AnalyticsMetricSchema = z.object({
  key: z.string().min(1),
  description: z.string().min(1),
});

const ConfigSchema = z.object({
  meta: z.object({
    projectName: z.string().min(1),
    description: z.string().min(1),
  }),
  settings: z.object({
    iterations: z.number().int().positive(),
    concurrency: z.number().int().positive(),
    lang: z.string().min(1),
  }),
  models: z.object({
    generator: z.string().min(1),
    interviewer: z.string().min(1),
    respondent: z.string().min(1),
    analyzer: z.string().min(1),
    advisor: z.string().min(1).optional(),
  }),
  segments: z.array(SegmentSchema).min(1),
  interviewFlow: z.object({
    context: z.string().min(1),
    script: z.array(z.string().min(1)).min(1),
    interviewerMode: z.enum(["script", "llm"]).optional(),
  }),
  analyticsSchema: z.array(AnalyticsMetricSchema).min(1),
});

const formatZodError = (error: z.ZodError): string =>
  error.issues
    .map((issue) => {
      const location = issue.path.length > 0 ? issue.path.join(".") : "config";
      return `${location}: ${issue.message}`;
    })
    .join("\n");

const normalizeConfig = (parsed: unknown): unknown => {
  if (!parsed || typeof parsed !== "object") {
    return parsed;
  }
  const candidate = parsed as Record<string, unknown>;
  const settings = candidate.settings;
  if (settings && typeof settings === "object") {
    const settingsObj = settings as Record<string, unknown>;
    const rawLang =
      typeof settingsObj.lang === "string"
        ? settingsObj.lang
        : typeof settingsObj.language === "string"
        ? settingsObj.language
        : "";
    const normalizedLang = rawLang.trim().length > 0 ? rawLang.trim() : "ru";
    settingsObj.lang = normalizedLang;
    delete settingsObj.language;
  }
  return candidate;
};

export class ConfigLoader {
  static async loadProjectConfig(
    projectName: string,
    projectsDir = path.join(process.cwd(), "config", "projects")
  ): Promise<IProjectConfig> {
    const filePath = path.join(projectsDir, `${projectName}.json`);
    return ConfigLoader.loadFromFile(filePath);
  }

  static async loadFromFile(filePath: string): Promise<IProjectConfig> {
    const raw = await fs.readFile(filePath, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON in ${filePath}: ${message}`);
    }

    const result = ConfigSchema.safeParse(normalizeConfig(parsed));
    if (!result.success) {
      throw new Error(
        `Config validation failed for ${filePath}:\n${formatZodError(result.error)}`
      );
    }

    return result.data;
  }
}
