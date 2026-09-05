import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FluentBundle, FluentResource } from "@fluent/bundle";
import * as cheerio from "cheerio";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = ["index.html", "roadmap.html", "about.html", "contact.html"];
const locales = [
  { code: "en", catalog: "english.flt" },
  { code: "li", catalog: "lorem.flt" },
];
const messageArguments = {
  "footer-copyright": { year: new Date().getFullYear() },
  "home-stat-containers-value": { count: 16 },
  "home-stat-packing-time-value": { seconds: 1.34 },
};

async function createBundle(locale) {
  const source = await readFile(path.join(root, "assets", "translations", locale.catalog), "utf8");
  const bundle = new FluentBundle(locale.code, { useIsolating: false });
  const errors = bundle.addResource(new FluentResource(source));

  if (errors.length) {
    throw new Error(`Unable to parse ${locale.catalog}: ${errors.map(String).join("; ")}`);
  }

  return {
    bundle,
    messageIds: new Set([...source.matchAll(/^([a-z][a-z0-9-]*)\s*=/gm)].map((match) => match[1])),
  };
}

function messageFor(catalog, locale, id) {
  const { bundle, messageIds } = catalog;
  const message = bundle.getMessage(id);
  const errors = [];

  if (!messageIds.has(id)) throw new Error(`Missing translation '${id}' in ${locale.catalog}`);
  if (!message?.value) return "";

  const value = bundle.formatPattern(message.value, messageArguments[id] ?? null, errors).trim();
  if (!errors.length) return value;

  throw new Error(`Unable to format translation '${id}' in ${locale.catalog}: ${errors.map(String).join("; ")}`);
}

function injectPartials(source, partials) {
  return source
    .replace(/<div hx-get="partials\/header\.html"[^>]*><\/div>/, partials.header)
    .replace(/<div hx-get="partials\/footer\.html"[^>]*><\/div>/, partials.footer)
    .replace(/<div hx-get="partials\/roadmap-done\.html"[\s\S]*?<\/div>/, `<div>${partials.roadmapDone}</div>`)
    .replace(/<div hx-get="partials\/roadmap-next\.html"[\s\S]*?<\/div>/, `<div>${partials.roadmapNext}</div>`);
}

function localize(source, catalog, locale) {
  const $ = cheerio.load(source, { decodeEntities: false });
  $("html").attr("lang", locale.code);
  $("[data-l10n-id]").each((_, element) => {
    const id = $(element).attr("data-l10n-id");
    $(element).html(messageFor(catalog, locale, id));
  });
  $("[data-l10n-attr]").each((_, element) => {
    $(element).attr("data-l10n-attr").split(",").forEach((binding) => {
      const [attribute, id] = binding.split(":");
      $(element).attr(attribute, messageFor(catalog, locale, id));
    });
  });
  $("[data-locale-link]").each((_, element) => {
    const targetLocale = $(element).attr("data-locale-link");
    const page = $("body").attr("data-page") === "index" ? "" : `${$("body").attr("data-page")}.html`;
    $(element).attr("href", `/${targetLocale}/${page}`);
  });
  $("link[href], img[src]").each((_, element) => {
    const attribute = element.tagName === "link" ? "href" : "src";
    const value = $(element).attr(attribute);
    if (value?.startsWith("assets/") || value?.startsWith("css/")) {
      $(element).attr(attribute, `../${value}`);
    }
  });
  $("[data-build-only]").remove();
  $("[hx-boost], [hx-trigger], [hx-swap]").removeAttr("hx-boost hx-trigger hx-swap");
  $("[data-l10n-id], [data-l10n-attr], [data-locale-link]").removeAttr("data-l10n-id data-l10n-attr data-locale-link");
  return $.html();
}

const partialNames = {
  header: "header.html",
  footer: "footer.html",
  roadmapDone: "roadmap-done.html",
  roadmapNext: "roadmap-next.html",
};
const partials = Object.fromEntries(
  await Promise.all(
    Object.entries(partialNames).map(async ([key, file]) => [key, await readFile(path.join(root, "templates", "partials", file), "utf8")]),
  ),
);

await rm(path.join(root, "dist"), { recursive: true, force: true });
await Promise.all(locales.map((locale) => rm(path.join(root, locale.code), { recursive: true, force: true })));
await mkdir(path.join(root, "assets", "icons"), { recursive: true });
await cp(
  path.join(root, "node_modules", "lucide-static", "icons", "languages.svg"),
  path.join(root, "assets", "icons", "languages.svg"),
);

for (const locale of locales) {
  const catalog = await createBundle(locale);
  const localeOutput = path.join(root, locale.code);
  await mkdir(localeOutput, { recursive: true });

  for (const page of pages) {
    const source = await readFile(path.join(root, "templates", page), "utf8");
    const document = localize(injectPartials(source, partials), catalog, locale);
    await writeFile(path.join(localeOutput, page), document);
  }
}

console.log("Generated static localized pages in en and li.");
