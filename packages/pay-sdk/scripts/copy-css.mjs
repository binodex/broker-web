import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

const ui = readFileSync("src/ui.css", "utf8");
const elements = readFileSync("src/elements.css", "utf8");
writeFileSync("dist/ui.css", ui);
writeFileSync("dist/elements.css", `${ui}\n${elements}`);
copyFileSync("src/fonts.css", "dist/fonts.css");
