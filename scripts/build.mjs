import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");

const html = fs.readFileSync(path.join(srcDir, "index.html"), "utf8");
const css = fs.readFileSync(path.join(srcDir, "styles.css"), "utf8");
const jsFiles = [
  "config.js",
  "js/state.js",
  "js/sync.js",
  "js/views.js",
  "js/create-modal.js"
];
const bundledJs = jsFiles
  .map((rel) => `// --- ${rel} ---\n` + fs.readFileSync(path.join(srcDir, rel), "utf8"))
  .join("\n");

const outHtml = html
  .replace(
    '<link rel="stylesheet" href="./styles.css" />',
    () => `<style>\n${css}</style>`
  )
  .replace(
    /<script src="\.\/config\.js"><\/script>[\s\S]*?<script src="\.\/js\/create-modal\.js"><\/script>/,
    () => `<script>\n(() => {\n${bundledJs}})();\n</script>`
  );

fs.mkdirSync(distDir, { recursive: true });
const outPath = path.join(distDir, "star-board.html");
fs.writeFileSync(outPath, outHtml, "utf8");
console.log(`Built ${outPath} (${outHtml.length} chars)`);
