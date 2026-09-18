# @taopp/webhooks

Watch TAOP program events on Solana and deliver **signed webhooks** to
subscriber endpoints. Built on `@taopp/solana`'s IDL-driven event decoder, so it
understands every program event (`CompletionAttested`, `ChallengeSubmitted`,
`ChallengeResolved`, `CapabilitySlashed`, ...).

## Run

```bash
# From the repository
pnpm --filter @taopp/webhooks build
node packages/webhooks/dist/index.cjs \
  --cluster devnet \
  --webhook https://example.com/hooks/taop \
  --secret "$TAOP_WEBHOOK_SECRET" \
  --state ./.taop-webhooks-state.json
```

Flags and environment:

| Flag | Env | Default |
|---|---|---|
| `--rpc` | `SOLANA_RPC_URL` | `https://api.devnet.solana.com` |
| `--program` | `TAOP_PROGRAM_ID` | `8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE` |
| `--webhook` | `TAOP_WEBHOOK_URL` | required |
| `--secret` | `TAOP_WEBHOOK_SECRET` | unset (no signature header) |
| `--cluster` | `TAOP_CLUSTER` | `devnet` |
| `--state` | `TAOP_WEBHOOK_STATE` | `./.taop-webhooks-state.json` |
| `--interval` | `TAOP_WEBHOOK_INTERVAL_MS` | `5000` |
| `--once` | - | off (poll once and exit, for cron) |

## Delivery format

```http
POST /hooks/taop HTTP/1.1
content-type: application/json
user-agent: taop-webhooks/0.1.0
x-taop-delivery: <signature>:<event index>
x-taop-timestamp: <unix seconds>
x-taop-signature: sha256=<hex hmac of "<timestamp>.<raw body>">
```

```json
{
  "id": "<signature>:0",
  "cluster": "devnet",
  "programId": "8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE",
  "signature": "...",
  "slot": 123,
  "blockTime": 1750000000,
  "name": "CompletionAttested",
  "data": { "agent": "...", "completion": "...", "completionId": "7" }
}
```

## Verifying deliveries

Always verify `x-taop-signature` against `x-taop-timestamp` and the raw body
before trusting a delivery, and de-duplicate on `x-taop-delivery` (delivery is
**at-least-once**; after a long downtime older transactions may be re-delivered).
Verification fails closed when the timestamp is missing or older than the
5-minute default tolerance, so a captured delivery cannot be replayed later:

```ts
import crypto from "node:crypto";
import express from "express";
import { verifySignature } from "@taopp/webhooks";

const app = express();
app.post(
  "/hooks/taop",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const valid = verifySignature(
      process.env.TAOP_WEBHOOK_SECRET!,
      req.body.toString(),
      req.header("x-taop-signature"),
      req.header("x-taop-timestamp"),
    );
    if (!valid) {
      return res.status(401).end();
    }
    const event = JSON.parse(req.body.toString());
    console.log(event.name, event.data);
    res.status(200).end();
  },
);
```

## Delivery guarantees

- Bounded retries (3 attempts, linear backoff) for network errors and non-2xx
  responses; failures are logged as `dead-letter <id>` and the cursor advances.
- State is written atomically after each transaction, so restarts resume near
  the last processed signature.
- No inbound server is started: this is an outbound dispatcher; subscriber
  endpoints are yours.

## Tests

```bash
pnpm --filter @taopp/webhooks test
# Integration test needs a local validator: ./scripts/localnet.sh
```
