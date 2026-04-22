import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateStack } from "../src/shared/validation";

describe("sample stack.json", () => {
  it("stays valid", async () => {
    const stackPath = path.resolve(__dirname, "..", "stack.json");
    const raw = JSON.parse(await readFile(stackPath, "utf-8")) as unknown;
    const result = validateStack(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      expect(result.errors).toEqual([]);
    }
  });
});
