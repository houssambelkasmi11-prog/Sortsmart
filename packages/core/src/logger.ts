import { redact } from "./security";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  data?: unknown;
  at: string;
}

export interface Logger {
  log(level: LogLevel, message: string, data?: unknown): void;
}

/** Logger that redacts every payload before it reaches a sink. */
export function createLogger(sink: (entry: LogEntry) => void, now: () => Date = () => new Date()): Logger {
  return {
    log(level, message, data) {
      sink({ level, message: redact(message) as string, data: data === undefined ? undefined : redact(data), at: now().toISOString() });
    },
  };
}

export const consoleLogger: Logger = createLogger((e) => {
  const fn = e.level === "error" ? console.error : e.level === "warn" ? console.warn : console.info;
  fn(`[sorte] ${e.message}`, e.data ?? "");
});

export const silentLogger: Logger = { log() {} };
