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
 * Decode TAOP program events from transaction log lines. Lines that are not
 * program events, or that belong to another program, are ignored.
 */
export function decodeEvents(
  program: Program<TaopReputation>,
  logs: readonly string[],
): TaopEvent[] {
  const coder = (program.coder as unknown as { events: EventCoderLike }).events;
  const events: TaopEvent[] = [];
  for (const line of logs) {
    const match = /Program data: (\S+)/.exec(line);
    if (!match) continue;
    try {
      const decoded = coder.decode(match[1]);
      if (decoded) {
        events.push({ name: decoded.name, data: decoded.data as Record<string, unknown> });
      }
    } catch {
      // Event from a different program, or a format we do not decode.
    }
  }
  return events;
}
