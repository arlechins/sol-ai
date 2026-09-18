import type { Program } from "@anchor-lang/core";

import type { TaopReputation } from "./idl/taop_reputation";

/** A decoded program event with its raw field payload. */
export interface TaopEvent<T = Record<string, unknown>> {
  name: string;
  data: T;
}

interface EventCoderLike {
  decode(data: string): { name: string; data: unknown } | null;
}

/**
 * Decode TAOP program events from transaction log lines.
 *
 * `Program data:` lines carry no program id, so they are attributed to the
 * program at the top of the invocation stack: a transaction that merely also
 * invokes TAOP cannot smuggle a forged event in from another program. Logs
 * without invocation markers (hand-written tests, trimmed logs) fall back to
 * decoding every `Program data:` line.
 */
export function decodeEvents(
  program: Program<TaopReputation>,
  logs: readonly string[],
): TaopEvent[] {
  const coder = (program.coder as unknown as { events: EventCoderLike }).events;
  const programId = program.programId.toBase58();
  const hasInvocationLogs = logs.some((line) => / invoke \[\d+\]$/.test(line));
  const stack: string[] = [];
  const events: TaopEvent[] = [];

  for (const line of logs) {
    const invoke = /^Program (\S+) invoke \[\d+\]$/.exec(line);
    if (invoke) {
      stack.push(invoke[1]);
      continue;
    }
    if (/^Program \S+ (success|failed:.*)$/.test(line)) {
      stack.pop();
      continue;
    }

    const match = /Program data: (\S+)/.exec(line);
    if (!match) continue;
    if (hasInvocationLogs && stack[stack.length - 1] !== programId) continue;

    try {
      const decoded = coder.decode(match[1]);
      if (decoded) {
        events.push({
          name: decoded.name,
          data: decoded.data as Record<string, unknown>,
        });
      }
    } catch {
      // Event from a different program, or a format we do not decode.
    }
  }
  return events;
}
