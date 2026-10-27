import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => {
  throw new Error("react must not be imported by @binopartner/pay-sdk/core");
});
vi.mock("react-dom", () => {
  throw new Error("react-dom must not be imported by @binopartner/pay-sdk/core");
});

const here = dirname(fileURLToPath(import.meta.url));
const IMPORT = /(?:import|export)[^"']*from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

const sourcesOf = (entry: string, seen = new Set<string>()): Set<string> => {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const text = readFileSync(entry, "utf8");
  for (const match of text.matchAll(IMPORT)) {
    const specifier = match[1] ?? match[2] ?? "";
    if (!specifier.startsWith(".")) {
      seen.add(`bare:${specifier}`);
      continue;
    }
    const target = resolve(dirname(entry), specifier.replace(/\.js$/, ".ts"));
    try {
      statSync(target);
      sourcesOf(target, seen);
    } catch {
      sourcesOf(target.replace(/\.ts$/, ".tsx"), seen);
    }
  }
  return seen;
};

describe("@binopartner/pay-sdk/core", () => {
  it("imports without react", async () => {
    const core = await import("./index.js");
    expect(typeof core.createPayClient).toBe("function");
    expect(typeof core.createDepositFlow).toBe("function");
  });

  it("has no runtime dependency at all in its import graph", () => {
    const graph = sourcesOf(join(here, "index.ts"));
    const bare = [...graph].filter((entry) => entry.startsWith("bare:"));
    expect(bare).toEqual([]);
    const files = [...graph].filter((entry) => !entry.startsWith("bare:"));
    expect(files.some((file) => file.endsWith(".tsx"))).toBe(false);
    expect(files.every((file) => !file.includes(`${join("src", "elements")}`))).toBe(true);
    expect(files.every((file) => !file.endsWith("react.tsx"))).toBe(true);
  });

  it("keeps every wire shape in core/wire.ts", () => {
    const files = readdirSync(here, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "wire.ts");
    for (const file of files) {
      const text = readFileSync(join(here, file), "utf8");
      expect(text, file).not.toMatch(/["'`]\/broker\//);
      expect(text, file).not.toMatch(/\b(?:access_token|api_bases|next_action|display_status)\b/);
    }
  });
});

describe("@binopartner/pay-sdk/ui", () => {
  const ui = join(here, "..", "ui", "index.ts");
  const FORBIDDEN = [
    join("core", "client.ts"),
    join("core", "flows"),
    join("core", "store.ts"),
    join("core", "poll.ts"),
    join("core", "auth.ts"),
    join("core", "api-base.ts"),
    join("core", "wire.ts"),
    join("core", "requisites-frame.ts"),
    join("src", "elements"),
    join("src", "react.tsx"),
    join("src", "mount.ts"),
    join("core", "i18n", "index.ts"),
    ...["ru", "de", "ua", "es", "fr", "hi", "tr", "ar", "it", "cs"].map((locale) => join("core", "i18n", `${locale}.ts`)),
  ];

  it("never imports networked or connected modules", () => {
    const graph = sourcesOf(ui);
    const files = [...graph].filter((entry) => !entry.startsWith("bare:"));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      for (const forbidden of FORBIDDEN) {
        expect(file.includes(forbidden), `${file} must not be reached from ui`).toBe(false);
      }
    }
  });

  it("depends on react only", () => {
    const bare = [...sourcesOf(ui)].filter((entry) => entry.startsWith("bare:"));
    expect(bare).toEqual(["bare:react"]);
  });

  it("touches no browser global at module scope", () => {
    const files = [...sourcesOf(ui)].filter((entry) => !entry.startsWith("bare:"));
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const topLevel = text
        .split("\n")
        .filter((line) => /^(?:const|let|var|export const)\s/.test(line))
        .join("\n");
      expect(topLevel, file).not.toMatch(/\b(?:window|document|navigator|localStorage)\./);
    }
  });
});
