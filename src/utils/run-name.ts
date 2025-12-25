import type { IProjectConfig } from "../types";
import { LlmClient } from "../core/LlmClient";

export const generateRunName = async (params: {
  client: LlmClient;
  config: IProjectConfig;
  tags: string[];
  model: string;
}): Promise<string> => {
  const tagLine = params.tags.length > 0 ? params.tags.join(", ") : "none";
  const prompt = [
    "You generate short run titles for CLI output folders.",
    "Return a short ASCII slug, 2-5 words, using only letters, numbers, and hyphens.",
    "No quotes, no punctuation, no extra text.",
    `Language: ${params.config.settings.lang} (transliterate if needed).`,
    `Project: ${params.config.meta.projectName}`,
    `Description: ${params.config.meta.description}`,
    `Tags: ${tagLine}`,
  ].join("\n");

  const response = await params.client.createChatCompletion({
    model: params.model,
    messages: [{ role: "system", content: prompt }],
    temperature: 0.2,
    max_tokens: 24,
  });
  const content = response.choices[0]?.message?.content ?? "";
  return content.replace(/<\/?s>|\[\/?OUT]|\[\/?B_INST]/gi, "").trim();
};
