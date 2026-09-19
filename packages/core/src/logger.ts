const SECRET_PATTERN = /(api[_-]?key|token|secret|password|authorization|bearer)([=:\s]+)([^\s,;]+)/gi;

export function redact(input: string): string {
  return input.replace(SECRET_PATTERN, (_match, key: string, separator: string) => `${key}${separator}[redacted]`);
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type Logger = {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(scope: string): Logger;
};

function format(scope: string, message: string, fields?: Record<string, unknown>): string {
  const suffix = fields && Object.keys(fields).length > 0
    ? ` ${redact(JSON.stringify(fields))}`
    : '';
  return `[${scope}] ${redact(message)}${suffix}`;
}

export function createLogger(level: LogLevel, scope = 'techpulse', sink: (line: string) => void = console.log): Logger {
  const enabled = (candidate: LogLevel): boolean => LEVEL_ORDER[candidate] >= LEVEL_ORDER[level];

  const make = (currentScope: string): Logger => ({
    debug(message, fields) {
      if (enabled('debug')) sink(format(currentScope, message, fields));
    },
    info(message, fields) {
      if (enabled('info')) sink(format(currentScope, message, fields));
    },
    warn(message, fields) {
      if (enabled('warn')) sink(format(currentScope, message, fields));
    },
    error(message, fields) {
      if (enabled('error')) sink(format(currentScope, message, fields));
    },
    child(childScope: string) {
      return make(`${currentScope}:${childScope}`);
    },
  });

  return make(scope);
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'timeout';
    if (cause?.code) return `${cause.code}: ${error.message}`;
    return error.message;
  }
  return String(error);
}
