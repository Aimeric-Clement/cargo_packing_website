import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build-locales.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const watchDirs = [path.join(root, "templates"), path.join(root, "assets", "translations")];

let running = false;
let pending = false;
let debounceTimer;

async function rebuild() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  try {
    await build();
    console.log(`[watch] rebuilt at ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    console.error("[watch] build failed:", error.message);
  } finally {
    running = false;
    if (pending) {
      pending = false;
      await rebuild();
    }
  }
}

await rebuild();
console.log("[watch] watching templates/ and assets/translations/ for changes (Ctrl+C to stop)...");

for (const dir of watchDirs) {
  watch(dir, { recursive: true }, () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(rebuild, 150);
  });
}
