import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";

import {
  deliverWebhook,
  loadState,
  pollOnce,
  saveState,
  signPayload,
  verifySignature,
  type DispatcherOptions,
  type WebhookEvent,
} from "../src/dispatcher";

const PROGRAM_ID = new PublicKey("8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE");

function event(id: string, name = "CompletionAttested"): WebhookEvent {
  return {
    id,
    cluster: "localnet",
    programId: PROGRAM_ID.toBase58(),
    signature: id.split(":")[0],
    slot: 1,
    blockTime: 1,
    name,
    data: { completionId: "1" },
  };
}

function fakeConnection(transactions: Map<string, { slot: number; blockTime: number; logs: string[] }>) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    getSignaturesForAddress: vi.fn(async (_program: PublicKey, options?: Record<string, unknown>) => {
      calls.push(options ?? {});
      const all = [...transactions.keys()].reverse(); // newest first
      const before = options?.before as string | undefined;
      const limit = (options?.limit as number) ?? 25;
      const start = before ? all.indexOf(before) + 1 : 0;
      return all
        .slice(start, start + limit)
        .map((signature) => ({ signature, slot: 1 }));
    }),
    getTransaction: vi.fn(async (signature: string) => {
      const entry = transactions.get(signature);
      if (!entry) return null;
      return { slot: entry.slot, blockTime: entry.blockTime, meta: { logMessages: entry.logs } };
    }),
  };
}

describe("signing", () => {
  it("computes the documented HMAC vectors", () => {
    expect(signPayload("secret", "hello")).toBe(
      "88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b",
    );
    expect(signPayload("secret", "hello", 1_700_000_000)).toBe(
      "47b1df0ab12338b2685470b0d2b37033add7c3b2bc8172f313e77413f1bb78c8",
    );
  });

  it("verifies timestamped signatures and rejects replays", () => {
    const body = JSON.stringify({ hello: "world" });
    const now = 1_700_000_000;
    const header = `sha256=${signPayload("secret", body, now)}`;

    expect(verifySignature("secret", body, header, now, { now })).toBe(true);
    expect(verifySignature("secret", body, header, now, { now: now + 299 })).toBe(true);
    expect(verifySignature("secret", body, header, now, { now: now + 301 })).toBe(false);
    // A captured delivery replayed later falls outside the window.
    expect(
      verifySignature("secret", body, header, now, { now: now + 86_400 }),
    ).toBe(false);
    // Fails closed without a timestamp, or with a tampered one.
    expect(verifySignature("secret", body, header, undefined)).toBe(false);
    expect(verifySignature("secret", body, header, now + 1, { now })).toBe(false);
    expect(verifySignature("secret", body, undefined, now, { now })).toBe(false);
    expect(verifySignature("other", body, header, now, { now })).toBe(false);
    expect(verifySignature("secret", body, "sha256=deadbeef", now, { now })).toBe(false);
  });
});

describe("deliverWebhook", () => {
  it("retries transient failures and succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return new Response(calls < 3 ? "nope" : "ok", { status: calls < 3 ? 500 : 200 });
    }) as unknown as typeof fetch;

    const result = await deliverWebhook(event("sig-1:0"), {
      webhookUrl: "https://example.test/hook",
      fetchImpl,
      retryDelayMs: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it("gives up after the attempt budget", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 503 })) as unknown as typeof fetch;
    const result = await deliverWebhook(event("sig-1:0"), {
      webhookUrl: "https://example.test/hook",
      fetchImpl,
      maxAttempts: 2,
      retryDelayMs: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.error).toContain("503");
  });

  it("signs the body when a secret is configured", async () => {
    let received: { headers: Record<string, string>; body: string } | undefined;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      received = {
        headers: init.headers as Record<string, string>,
        body: String(init.body),
      };
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    await deliverWebhook(event("sig-1:0"), {
      webhookUrl: "https://example.test/hook",
      secret: "topsecret",
      fetchImpl,
    });
    expect(received).toBeDefined();
    expect(
      verifySignature(
        "topsecret",
        received!.body,
        received!.headers["x-taop-signature"],
        received!.headers["x-taop-timestamp"],
      ),
    ).toBe(true);
    expect(received!.headers["x-taop-delivery"]).toBe("sig-1:0");
  });
});

describe("pollOnce", () => {
  it("does not advance past a transaction it could not fetch", async () => {
    const connection = fakeConnection(
      new Map([
        ["sig-1", { slot: 1, blockTime: 10, logs: ["Program data: a"] }],
        ["sig-2", { slot: 2, blockTime: 11, logs: ["Program data: b"] }],
      ]),
    );
    // Simulate RPC lag for the oldest transaction.
    const original = connection.getTransaction;
    connection.getTransaction = vi.fn(async (signature: string) =>
      signature === "sig-1" ? null : original(signature),
    ) as typeof connection.getTransaction;

    const delivered: WebhookEvent[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      delivered.push(JSON.parse(String(init.body)) as WebhookEvent);
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const state = { lastSignature: null };
    const result = await pollOnce(
      {
        connection: connection as unknown as DispatcherOptions["connection"],
        programId: PROGRAM_ID,
        webhookUrl: "https://example.test/hook",
        fetchImpl,
        decode: (logs) => logs.map(() => ({ name: "CompletionAttested", data: {} })),
      },
      state,
    );

    expect(result.processed).toBe(0);
    expect(delivered).toHaveLength(0);
    expect(state.lastSignature).toBeNull();
  });

  it("pages past ten windows instead of dropping older events", async () => {
    const transactions = new Map<string, { slot: number; blockTime: number; logs: string[] }>();
    for (let i = 1; i <= 60; i += 1) {
      transactions.set(`sig-${String(i).padStart(3, "0")}`, {
        slot: i,
        blockTime: i,
        logs: ["Program data: x"],
      });
    }
    const connection = fakeConnection(transactions);
    const delivered: WebhookEvent[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      delivered.push(JSON.parse(String(init.body)) as WebhookEvent);
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const state = { lastSignature: null };
    const result = await pollOnce(
      {
        connection: connection as unknown as DispatcherOptions["connection"],
        programId: PROGRAM_ID,
        webhookUrl: "https://example.test/hook",
        fetchImpl,
        maxSignaturesPerPoll: 5,
        decode: (logs) => logs.map(() => ({ name: "CompletionAttested", data: {} })),
      },
      state,
    );

    expect(result.processed).toBe(60);
    expect(delivered).toHaveLength(60);
    expect(state.lastSignature).toBe("sig-060");
  });

  it("delivers oldest-first, persists state, and does not replay", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "taop-webhooks-"));
    const statePath = path.join(directory, "state.json");
    const connection = fakeConnection(
      new Map([
        ["sig-1", { slot: 1, blockTime: 10, logs: ["Program data: a"] }],
        ["sig-2", { slot: 2, blockTime: 11, logs: ["Program data: b"] }],
      ]),
    );
    const delivered: WebhookEvent[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      delivered.push(JSON.parse(String(init.body)) as WebhookEvent);
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const options = {
      connection: connection as unknown as DispatcherOptions["connection"],
      programId: PROGRAM_ID,
      webhookUrl: "https://example.test/hook",
      statePath,
      fetchImpl,
      decode: (logs) => logs.map(() => ({ name: "CompletionAttested", data: { ok: true } })),
    } satisfies DispatcherOptions;

    const state = loadState(statePath);
    const first = await pollOnce(options, state);
    expect(first.processed).toBe(2);
    expect(first.delivered).toBe(2);
    expect(first.failed).toBe(0);
    expect(state.lastSignature).toBe("sig-2");
    expect(delivered.map((e) => e.id)).toEqual(["sig-1:0", "sig-2:0"]);
    expect(loadState(statePath).lastSignature).toBe("sig-2");

    const second = await pollOnce(options, loadState(statePath));
    expect(second.processed).toBe(0);
    expect(delivered).toHaveLength(2);
  });

  it("paginates through more signatures than one page", async () => {
    const connection = fakeConnection(
      new Map([
        ["sig-1", { slot: 1, blockTime: 10, logs: ["Program data: a"] }],
        ["sig-2", { slot: 2, blockTime: 11, logs: ["Program data: b"] }],
        ["sig-3", { slot: 3, blockTime: 12, logs: ["Program data: c"] }],
      ]),
    );
    const delivered: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      delivered.push((JSON.parse(String(init.body)) as WebhookEvent).id);
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await pollOnce(
      {
        connection: connection as unknown as DispatcherOptions["connection"],
        programId: PROGRAM_ID,
        webhookUrl: "https://example.test/hook",
        fetchImpl,
        maxSignaturesPerPoll: 2,
        decode: (logs) => logs.map(() => ({ name: "CompletionAttested", data: {} })),
      },
      { lastSignature: null },
    );
    expect(result.processed).toBe(3);
    expect(delivered).toEqual(["sig-1:0", "sig-2:0", "sig-3:0"]);
  });

  it("counts dead letters without stalling the cursor", async () => {
    const connection = fakeConnection(
      new Map([["sig-9", { slot: 9, blockTime: 1, logs: ["Program data: x"] }]]),
    );
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 500 })) as unknown as typeof fetch;
    const state = { lastSignature: null };
    const result = await pollOnce(
      {
        connection: connection as unknown as DispatcherOptions["connection"],
        programId: PROGRAM_ID,
        webhookUrl: "https://example.test/hook",
        fetchImpl,
        maxAttempts: 1,
        retryDelayMs: 1,
        log: () => {},
        decode: (logs) => logs.map(() => ({ name: "CompletionAttested", data: {} })),
      },
      state,
    );
    expect(result.failed).toBe(1);
    expect(state.lastSignature).toBe("sig-9");
  });
});

describe("state", () => {
  it("round-trips through the filesystem", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "taop-webhooks-"));
    const statePath = path.join(directory, "nested", "state.json");
    saveState(statePath, { lastSignature: "abc" });
    expect(loadState(statePath).lastSignature).toBe("abc");
    expect(loadState(path.join(directory, "missing.json")).lastSignature).toBeNull();
  });
});
