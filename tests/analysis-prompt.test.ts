import assert from "node:assert/strict";

import type { IInterviewSession, IProjectConfig } from "../src/types";
import { buildAnalyticsPrompt } from "../src/stages/3-analyze";

export const tests = [
  {
    name: "buildAnalyticsPrompt includes fields and transcript",
    run: () => {
      const config: IProjectConfig = {
        meta: { projectName: "demo", description: "demo" },
        settings: { iterations: 1, concurrency: 1, lang: "en" },
        models: {
          generator: "model",
          interviewer: "model",
          respondent: "model",
          analyzer: "model",
        },
        segments: [{ id: "s1", name: "Segment", weight: 1, traits: [] }],
        interviewFlow: { context: "context", script: ["q1"] },
        analyticsSchema: [
          { key: "frequency", description: "How often?" },
          { key: "pain", description: "Pain points" },
        ],
      };

      const session: IInterviewSession = {
        id: "session-1",
        projectName: "demo",
        personaId: "p1",
        segmentId: "s1",
        startedAt: "2024-01-01T00:00:00.000Z",
        endedAt: "2024-01-01T00:00:10.000Z",
        messages: [
          { role: "user", content: "Question?" },
          { role: "assistant", content: "Answer." },
        ],
      };

      const prompt = buildAnalyticsPrompt(config, session);
      assert.ok(prompt.includes("Fields:"));
      assert.ok(prompt.includes("frequency"));
      assert.ok(prompt.includes("Pain points"));
      assert.ok(prompt.includes("Transcript:"));
      assert.ok(prompt.includes("USER: Question?"));
      assert.ok(prompt.includes("ASSISTANT: Answer."));
    },
  },
];
