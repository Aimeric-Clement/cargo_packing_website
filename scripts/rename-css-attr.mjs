// Renames a CSS custom property or class name across css/style.css and all
// templates/**/*.html, since VS Code's F2 rename can't follow the reference
// from an inline style="var(--x)"/class="x" attribute back to css/style.css.
import { readFile, writeFile } from "node:fs/promises";
import { glob } from "node:fs/promises";

const [oldName, newName] = process.argv.slice(2);
if (!oldName || !newName) {
  console.error("Usage: node scripts/rename-css-attr.mjs <old-name> <new-name>");
  console.error("Examples: --header-h --header-height   |   feature-card feature-tile");
  process.exit(1);
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// CSS identifier boundary: don't match inside a longer name (e.g. --header-h vs --header-height).
const pattern = new RegExp(`(?<![\\w-])${escapeRegex(oldName)}(?![\\w-])`, "g");

const files = [
  "css/style.css",
  ...(await Array.fromAsync(glob("templates/**/*.html"))),
];

let totalReplacements = 0;
for (const file of files) {
  const original = await readFile(file, "utf8");
  let count = 0;
  const updated = original.replace(pattern, () => {
    count++;
    return newName;
  });
  if (count > 0) {
    await writeFile(file, updated, "utf8");
    console.log(`${file}: ${count} replacement(s)`);
    totalReplacements += count;
  }
}

console.log(`Done. ${totalReplacements} total replacement(s) for "${oldName}" -> "${newName}".`);
console.log(`Run "npm run build" to regenerate the built locale pages.`);
