import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FluentBundle, FluentResource } from "@fluent/bundle";
import * as cheerio from "cheerio";
import { localeConfig } from "./locales.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = ["index.html", "roadmap.html", "about.html", "contact.html"];
const publicSiteUrl = new URL("https://cargo-packer.com");
const { locales, templateCatalog } = localeConfig;
const publicLocales = locales.filter((locale) => locale.showInLanguageSelector);
const messageArguments = {
  "footer-copyright": { year: new Date().getFullYear() },
  "home-stat-containers-value": { count: 16 },
  "home-stat-packing-time-value": { seconds: 1.34 },
};

function validateLocaleConfig() {
  const catalogName = /^[A-Za-z0-9][A-Za-z0-9._-]*\.flt$/;
  const localeFolder = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
  const translationKey = /^[a-z][a-z0-9-]*$/;
  const seenValues = new Map();

  if (!catalogName.test(templateCatalog)) throw new Error("localeConfig.templateCatalog must be a .flt filename");
  if (!Array.isArray(locales) || !locales.length) throw new Error("localeConfig.locales must contain at least one locale");

  for (const locale of locales) {
    const { catalog, locale: localeCode, pageFolder, displayNameKey, showInLanguageSelector } = locale;
    const fields = [
      ["catalog", catalog, catalogName],
      ["locale", localeCode, localeFolder],
      ["pageFolder", pageFolder, localeFolder],
      ["displayNameKey", displayNameKey, translationKey],
    ];

    for (const [field, value, pattern] of fields) {
      if (typeof value !== "string" || !pattern.test(value)) {
        throw new Error(`Invalid localeConfig ${field}: '${value}'`);
      }
      const previousLocale = seenValues.get(`${field}:${value}`);
      if (previousLocale) throw new Error(`Duplicate localeConfig ${field} '${value}' for ${previousLocale} and ${localeCode}`);
      seenValues.set(`${field}:${value}`, localeCode);
    }

    if (typeof showInLanguageSelector !== "boolean") {
      throw new Error(`localeConfig showInLanguageSelector must be boolean for ${localeCode}`);
    }
  }
}

async function ensureCatalogsExist() {
  const template = await readFile(path.join(root, "assets", "translations", templateCatalog), "utf8");

  await Promise.all(locales.map(async (locale) => {
    try {
      await access(path.join(root, "assets", "translations", locale.catalog));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await writeFile(path.join(root, "assets", "translations", locale.catalog), template);
    }
  }));
}

async function createBundle(locale) {
  const source = await readFile(path.join(root, "assets", "translations", locale.catalog), "utf8");
  const bundle = new FluentBundle(locale.locale, { useIsolating: false });
  const errors = bundle.addResource(new FluentResource(source));

  if (errors.length) {
    throw new Error(`Unable to parse ${locale.catalog}: ${errors.map(String).join("; ")}`);
  }

  return {
    bundle,
    messageIds: new Set([...source.matchAll(/^([a-z][a-z0-9-]*)\s*=/gm)].map((match) => match[1])),
  };
}

function validateCatalogMessages(catalog, locale, templateMessageIds) {
  const missing = [...templateMessageIds].filter((id) => !catalog.messageIds.has(id));
  const unexpected = [...catalog.messageIds].filter((id) => !templateMessageIds.has(id));
  if (missing.length || unexpected.length) {
    throw new Error(
      `Translation keys in ${locale.catalog} do not match ${templateCatalog}: `
        + `${missing.length ? `missing ${missing.join(", ")}` : ""}`
        + `${missing.length && unexpected.length ? "; " : ""}`
        + `${unexpected.length ? `unexpected ${unexpected.join(", ")}` : ""}`,
    );
  }
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
  const languageOptions = locales
    .filter((locale) => locale.showInLanguageSelector)
    .map((locale) => `<a data-locale-link="${locale.pageFolder}" data-l10n-id="${locale.displayNameKey}"></a>`)
    .join("");
  const renderedPartials = Object.fromEntries(
    Object.entries(partials).map(([name, partial]) => [
      name,
      partial.replace(
        '<div class="language-options" data-language-options></div>',
        `<div class="language-options">${languageOptions}</div>`,
      ),
    ]),
  );

  return source
    .replace(/<div hx-get="partials\/header\.html"[^>]*><\/div>/, renderedPartials.header)
    .replace(/<div hx-get="partials\/footer\.html"[^>]*><\/div>/, renderedPartials.footer)
    .replace(/<div hx-get="partials\/roadmap-done\.html"[\s\S]*?<\/div>/, `<div>${renderedPartials.roadmapDone}</div>`)
    .replace(/<div hx-get="partials\/roadmap-next\.html"[\s\S]*?<\/div>/, `<div>${renderedPartials.roadmapNext}</div>`);
}

function publicPageUrl(locale, page) {
  const pagePath = page === "index.html" ? "" : page;
  return new URL(`/${locale.pageFolder}/${pagePath}`, publicSiteUrl).href;
}

function addSeoMetadata($, locale) {
  if (!publicLocales.includes(locale)) return;

  const page = $("body").attr("data-page");
  const pageFile = page === "index" ? "index.html" : `${page}.html`;
  const head = $("head");

  head.find("link[rel='canonical'], link[rel='alternate'][hreflang]").remove();
  head.append(`<link rel="canonical" href="${publicPageUrl(locale, pageFile)}">`);
  publicLocales.forEach((alternateLocale) => {
    head.append(`<link rel="alternate" hreflang="${alternateLocale.locale}" href="${publicPageUrl(alternateLocale, pageFile)}">`);
  });
}

function localize(source, catalog, locale) {
  const $ = cheerio.load(source, { decodeEntities: false });
  $("html").attr("lang", locale.locale);
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
    const targetFolder = $(element).attr("data-locale-link");
    const page = $("body").attr("data-page") === "index" ? "" : `${$("body").attr("data-page")}.html`;
    $(element).attr("href", `/${targetFolder}/${page}`);
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
  addSeoMetadata($, locale);
  return $.html();
}

function sitemap() {
  const urls = publicLocales.flatMap((locale) => pages.map((page) => publicPageUrl(locale, page)));
  const entries = urls.map((url) => `  <url>\n    <loc>${url}</loc>\n  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function robots() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${new URL("/sitemap.xml", publicSiteUrl).href}\n`;
}

function rootRedirect() {
  const englishHome = publicPageUrl(publicLocales[0], "index.html");
  return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta http-equiv="refresh" content="0; url=/en/">\n  <link rel="canonical" href="${englishHome}">\n  <link rel="icon" href="/assets/logo_ready_cargo_packer_large.svg" type="image/svg+xml">\n</head>\n<body></body>\n</html>\n`;
}

async function isGeneratedLocaleDirectory(directoryName) {
  try {
    await Promise.all(pages.map((page) => access(path.join(root, directoryName, page))));
    return true;
  } catch {
    return false;
  }
}

async function clearLocaleOutputDirectories() {
  const configuredFolders = new Set(locales.map((locale) => locale.pageFolder));
  const localeFolder = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
  const entries = await readdir(root, { withFileTypes: true });

  await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const isConfiguredFolder = configuredFolders.has(entry.name);
    const isStaleLocaleFolder = !isConfiguredFolder
      && localeFolder.test(entry.name)
      && await isGeneratedLocaleDirectory(entry.name);
    if (isConfiguredFolder || isStaleLocaleFolder) {
      await rm(path.join(root, entry.name), { recursive: true, force: true });
    }
  }));
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

validateLocaleConfig();
await ensureCatalogsExist();
const template = await createBundle({ catalog: templateCatalog, locale: "template" });
const catalogs = new Map(await Promise.all(locales.map(async (locale) => {
  const catalog = await createBundle(locale);
  validateCatalogMessages(catalog, locale, template.messageIds);
  return [locale.pageFolder, catalog];
})));

await rm(path.join(root, "dist"), { recursive: true, force: true });
await clearLocaleOutputDirectories();
await mkdir(path.join(root, "assets", "icons"), { recursive: true });
await cp(
  path.join(root, "node_modules", "lucide-static", "icons", "languages.svg"),
  path.join(root, "assets", "icons", "languages.svg"),
);

for (const locale of locales) {
  const catalog = catalogs.get(locale.pageFolder);
  const localeOutput = path.join(root, locale.pageFolder);
  await mkdir(localeOutput, { recursive: true });

  for (const page of pages) {
    const source = await readFile(path.join(root, "templates", page), "utf8");
    const document = localize(injectPartials(source, partials), catalog, locale);
    await writeFile(path.join(localeOutput, page), document);
  }
}

await Promise.all([
  writeFile(path.join(root, "index.html"), rootRedirect()),
  writeFile(path.join(root, "sitemap.xml"), sitemap()),
  writeFile(path.join(root, "robots.txt"), robots()),
]);

console.log(`Generated static localized pages in ${locales.map((locale) => locale.pageFolder).join(", ")}.`);
