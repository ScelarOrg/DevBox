import { describe, expect, it } from "vitest";
import { containsJsx } from "../threading/jsx-detection";

describe("shared JSX detection", () => {
  it("recognizes JSX syntax and compiled JSX helpers", () => {
    expect(containsJsx("const view = <Component />;")).toBe(true);
    expect(containsJsx("const view = jsx('div', {});")).toBe(true);
    expect(containsJsx("const value = a < b;\nconst other = value + 1;")).toBe(false);
  });
});
