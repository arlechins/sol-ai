import { describe, expect, it } from "vitest";

import { anchor } from "../src/anchor";

describe("anchor interop", () => {
  it("always exposes BN regardless of Node's CJS named-export detection", () => {
    expect(typeof anchor.BN).toBe("function");
    expect(new anchor.BN(7).toNumber()).toBe(7);
  });

  it("keeps the other runtime bindings the client uses", () => {
    expect(typeof anchor.AnchorProvider).toBe("function");
    expect(typeof anchor.Program).toBe("function");
  });
});
