import { promises as fs } from "fs";
import path from "path";

export type LogLevel = "info" | "warn" | "error";

const levelPrefixes: Record<LogLevel, string> = {
  info: "[INFO]",
  warn: "[WARN]",
  error: "[ERROR]",
};

export class Logger {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async info(message: string): Promise<void> {
    await this.write("info", message);
  }

  async warn(message: string): Promise<void> {
    await this.write("warn", message);
  }

  async error(message: string): Promise<void> {
    await this.write("error", message);
  }

  async write(level: LogLevel, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const line = `${timestamp} ${levelPrefixes[level]} ${message}`;
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
    await this.appendToFile(line);
  }

  private async appendToFile(line: string): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const filePath = path.join(this.baseDir, "app.log");
    await fs.appendFile(filePath, `${line}\n`, "utf-8");
  }
}
