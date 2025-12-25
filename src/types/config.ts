export interface IProjectConfig {
  meta: {
    projectName: string;
    description: string;
  };
  settings: {
    iterations: number;
    concurrency: number;
    lang: string;
  };
  models: {
    generator: string;
    interviewer: string;
    respondent: string;
    analyzer: string;
    advisor?: string;
  };
  segments: ISegment[];
  interviewFlow: {
    context: string;
    script: string[];
    interviewerMode?: "script" | "llm";
  };
  analyticsSchema: IAnalyticsMetric[];
}

export interface ISegment {
  id: string;
  name: string;
  weight: number;
  traits: string[];
  tooling?: string[];
  painPoints?: string[];
  cadence?: string;
}

export interface IAnalyticsMetric {
  key: string;
  description: string;
}
