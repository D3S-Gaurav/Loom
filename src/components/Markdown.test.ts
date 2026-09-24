import { describe, expect, it } from "vitest";
import { normalizeMarkdown } from "./Markdown";

describe("normalizeMarkdown", () => {
  it("turns model-authored HTML breaks into safe Markdown line breaks", () => {
    expect(normalizeMarkdown("First<br>Second<br />Third")).toBe("First  \nSecond  \nThird");
  });
});
