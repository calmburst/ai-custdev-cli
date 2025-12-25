import type { OpenAIMessage } from "../types";

export const extractMessageText = (
  message?: OpenAIMessage | null
): string => {
  if (!message) {
    return "";
  }
  const content = message.content?.trim();
  if (content) {
    return content;
  }
  const reasoning = (message as OpenAIMessage & { reasoning?: string })
    .reasoning?.trim();
  return reasoning ?? "";
};
