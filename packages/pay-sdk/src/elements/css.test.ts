import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TOKEN_NAMES } from "../core/appearance.js";

const src = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => readFileSync(join(src, file), "utf8");
const ui = read("ui.css");
const elements = read("elements.css");
const bundle = `${ui}\n${elements}`;

const splitTopLevel = (selector: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of selector) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += char;
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
};

const selectorsOf = (source: string): string[] => {
  const body = source.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const result: string[] = [];
  for (const match of body.matchAll(/([^{};]+)\{[^{}]*\}/g)) {
    const selector = (match[1] ?? "").trim();
    if (selector && !selector.startsWith("@")) result.push(...splitTopLevel(selector));
  }
  return result;
};

const inner = (css: string) => css.slice(css.indexOf("{") + 1, css.lastIndexOf("}"));

describe.each([
  ["ui.css", ui],
  ["elements.css", elements],
])("%s", (_, css) => {
  it("puts every rule inside the binopartner-pay layer", () => {
    const trimmed = css.trim();
    expect(trimmed.startsWith("@layer binopartner-pay {")).toBe(true);
    expect(trimmed.endsWith("}")).toBe(true);
    expect(trimmed.match(/@layer/g)).toHaveLength(1);
  });

  it("never styles anything outside the SDK root", () => {
    const selectors = selectorsOf(inner(css));
    expect(selectors.length).toBeGreaterThan(5);
    for (const selector of selectors) {
      expect(selector, selector).toMatch(/^(?:\.bp-|:where\(\.bp-root\)|:where\(\[data-invalid\]\) > \.bp-)/);
    }
  });

  it("keeps room for the open country list inside the card tab, which the card scroller would clip", () => {
    const rule = /\.bp-card-tab:has\(> \.bp-country-select\[data-open\]\) \{\s*min-height: calc\(var\(--bp-control-height\) \+ (\d+)px \+ (\d+)px \+ (\d+)px\);/.exec(ui);
    expect(rule, "open country list room").not.toBeNull();
    const [, gap, list, border] = (rule ?? []).map(Number);
    expect(gap).toBe(Number(/\.bp-country-panel \{[^}]*top: calc\(100% \+ (\d+)px\)/.exec(ui)?.[1]));
    expect(list).toBe(Number(/\.bp-country-list \{[^}]*max-height: (\d+)px/.exec(ui)?.[1]));
    expect(border).toBe(2);
    expect(/\.bp-card-scroll \{[^}]*overflow-y: auto/.test(ui)).toBe(true);
  });

  it("takes every corner radius from the radius tokens", () => {
    const radii = [...css.matchAll(/border-radius:\s*([^;]+);/g)].map((match) => match[1]!.trim());
    for (const value of radii) {
      if (value === "50%" || value === "24px") continue;
      for (const part of value.split(/\s+(?![^(]*\))/)) {
        expect(part, value).toMatch(/^(?:0|var\(--bp-radius-(?:sm|md|lg|pill)\)|calc\(var\(--bp-radius-md\) [-/] 2(?:px)?\))$/);
      }
    }
  });

  it("has no !important and no global element selectors", () => {
    expect(css).not.toContain("!important");
    for (const selector of selectorsOf(inner(css))) {
      expect(selector, selector).not.toMatch(/^(?:html|body|:root|\*)/);
    }
  });
});

describe("bundled css", () => {
  it("defines every documented token on the root", () => {
    const root = ui.slice(ui.indexOf(".bp-root {"), ui.indexOf("}", ui.indexOf(".bp-root {")));
    for (const token of TOKEN_NAMES) {
      expect(root, token).toContain(`--bp-${token}:`);
    }
    expect(root).toContain('--bp-font-family: "Gilroy"');
  });

  it("ships light by default, Classic navy as dark and the black skin", () => {
    expect(bundle).toContain('.bp-root[data-theme="dark"] {');
    expect(bundle).toContain('.bp-root[data-theme="dark"][data-skin="black"] {');
    expect(bundle).toMatch(/@media \(prefers-color-scheme: dark\) \{\s+\.bp-root\[data-theme="auto"\] \{/);
    expect(bundle).toContain('.bp-root[data-theme="auto"][data-skin="black"] {');
    const navy = bundle.slice(bundle.indexOf('.bp-root[data-theme="dark"] {'));
    expect(navy).toMatch(/--bp-color-bg: #2c344b;/);
    const black = bundle.slice(bundle.indexOf('.bp-root[data-theme="dark"][data-skin="black"] {'));
    expect(black).toMatch(/--bp-color-bg: #0d0c0c;/);
  });

  it("never loads fonts or remote assets from the library css", () => {
    expect(bundle).not.toMatch(/@font-face|@import|url\(/);
  });
});
