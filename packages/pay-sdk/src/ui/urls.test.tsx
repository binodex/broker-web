import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as ui from "./index.js";
import { DEFAULT_ASSET_BASE_URL } from "./context.js";
import { safeBaseUrl } from "./urls.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const flagSrc = (assetBaseUrl: string | undefined) => {
  const html = renderToString(
    <ui.PayUiProvider assetBaseUrl={assetBaseUrl}>
      <ui.CountrySelect value="DE" countries={["DE"]} onChange={() => undefined} />
    </ui.PayUiProvider>,
  );
  return /<img[^>]+src="([^"]+)"/.exec(html)?.[1] ?? null;
};

describe("safeBaseUrl", () => {
  it.each([
    ["https://cdn.example/assets/", "https://cdn.example/assets"],
    ["https://cdn.example", "https://cdn.example"],
    ["http://localhost:5173", "http://localhost:5173"],
    ["http://127.0.0.1:8080/x", "http://127.0.0.1:8080/x"],
    ["http://[::1]:3000", "http://[::1]:3000"],
    ["http://app.localhost", "http://app.localhost"],
    ["", ""],
  ])("accepts %j", (value, expected) => {
    expect(safeBaseUrl(value)).toBe(expected);
  });

  it.each([
    "http://cdn.example",
    "javascript:alert(1)",
    "data:text/css,x",
    "//cdn.example",
    "/assets",
    "https://user:pass@cdn.example",
    "https://cdn.example/?q=1",
    "https://cdn.example/#x",
    "http://localhost.evil.example",
    "not a url",
  ])("refuses %j", (value) => {
    expect(safeBaseUrl(value)).toBeNull();
  });
});

describe("assetBaseUrl", () => {
  it("keeps an https base and a same-origin empty base", () => {
    expect(flagSrc("https://cdn.example/")).toMatch(/^https:\/\/cdn\.example\/[^/]/);
    expect(flagSrc("")).toMatch(/^\/[^/]/);
  });

  it("ignores an insecure base with a dev warning and uses the default", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(flagSrc("http://cdn.example")?.startsWith(`${DEFAULT_ASSET_BASE_URL}/`)).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("assetBaseUrl"));
  });
});

describe("fontFaceCss", () => {
  it("ignores an unsafe base with a dev warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const css = ui.fontFaceCss('http://cdn.example/x");}body{background:red');
    expect(css).toContain(`url("${ui.DEFAULT_FONT_BASE_URL}/Gilroy-Bold.woff2")`);
    expect(css).not.toContain("background:red");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("fontFaceCss"));
  });

  it("never lets the base break out of the CSS string", () => {
    const css = ui.fontFaceCss('https://cdn.example/a"b\\c');
    expect(css.match(/@font-face/g)).toHaveLength(4);
    for (const [, inside] of css.matchAll(/url\(("(?:[^"\\]|\\.)*")\)/g)) {
      expect(inside).toMatch(/^"https:\/\/cdn\.example\//);
    }
    expect(css.match(/url\(/g)).toHaveLength(4);
    expect(css).not.toMatch(/[^\\]"b/);
  });
});
