import axios, { AxiosInstance } from "axios";
import dotenv from "dotenv";

import type { OpenAIMessage } from "../types";
import { reportProgress } from "../utils/progress";

dotenv.config();

export interface LlmClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  initialBackoffMs?: number;
}

export interface ChatCompletionRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    message: OpenAIMessage & { reasoning?: string | null };
    finish_reason?: string | null;
  }>;
}

export interface OpenRouterKeyStatus {
  label?: string;
  usage?: {
    total_requests?: number;
    total_tokens?: number;
  };
  limits?: {
    remaining?: number;
  };
  data?: Record<string, unknown>;
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class LlmClient {
  private readonly client: AxiosInstance;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;

  constructor(options: LlmClientOptions = {}) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required in environment variables.");
    }

    this.client = axios.create({
      baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
      timeout: options.timeoutMs ?? 60_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(process.env.OPENROUTER_REFERER
          ? { "HTTP-Referer": process.env.OPENROUTER_REFERER }
          : {}),
        ...(process.env.OPENROUTER_TITLE
          ? { "X-Title": process.env.OPENROUTER_TITLE }
          : {}),
      },
    });
    this.maxRetries = options.maxRetries ?? 6;
    this.initialBackoffMs = options.initialBackoffMs ?? 2_000;
  }

  async createChatCompletion(
    payload: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    let attempt = 0;
    let backoff = this.initialBackoffMs;
    while (true) {
      try {
        const response = await this.client.post<ChatCompletionResponse>(
          "/chat/completions",
          payload
        );
        reportProgress(1);
        return response.data;
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        const isTimeout =
          axios.isAxiosError(error) &&
          (error.code === "ECONNABORTED" || error.message.includes("timeout"));
        const shouldRetry =
          isTimeout || status === 429 || status === 500 || status === 503;
        if (!shouldRetry || attempt >= this.maxRetries) {
          const message = axios.isAxiosError(error)
            ? error.message
            : error instanceof Error
            ? error.message
            : String(error);
          const responseData = axios.isAxiosError(error)
            ? JSON.stringify(error.response?.data)
            : "";
          const statusInfo = status ? ` (status ${status})` : "";
          const details = responseData ? ` - ${responseData}` : "";
          throw new Error(`LLM request failed${statusInfo}: ${message}${details}`);
        }
        const retryAfter = axios.isAxiosError(error)
          ? Number(error.response?.headers?.["retry-after"])
          : NaN;
        const retryAfterMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 0;
        const delayMs = Math.max(backoff, retryAfterMs);
        await sleep(delayMs);
        backoff *= 2;
        attempt += 1;
      }
    }
  }

  async getKeyStatus(): Promise<OpenRouterKeyStatus> {
    const response = await this.client.get<OpenRouterKeyStatus>("/auth/key");
    return response.data;
  }
}
