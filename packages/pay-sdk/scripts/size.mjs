import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { build, transform } from "esbuild";

const LIMITS = { js: 25 * 1024, css: 8 * 1024 };

const bundled = await build({
  entryPoints: ["dist/ui/index.js"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  write: false,
  external: ["react", "react-dom", "react/jsx-runtime"],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "silent",
});
const js = gzipSync(bundled.outputFiles[0].contents).length;
const css = gzipSync((await transform(readFileSync("dist/ui.css", "utf8"), { loader: "css", minify: true })).code).length;

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const rows = [
  ["ui js (min+gz)", js, LIMITS.js],
  ["ui.css (min+gz)", css, LIMITS.css],
];
let failed = false;
for (const [name, size, limit] of rows) {
  const ok = size <= limit;
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${kb(size)} / ${kb(limit)}`);
}
process.exit(failed ? 1 : 0);
