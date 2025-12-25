export type OpenAIMessageRole = "system" | "user" | "assistant";

export interface OpenAIMessage {
  role: OpenAIMessageRole;
  content: string;
  reasoning?: string;
}

export interface IInterviewSession {
  id: string;
  projectName: string;
  personaId: string;
  segmentId: string;
  startedAt: string;
  endedAt: string;
  messages: OpenAIMessage[];
}
