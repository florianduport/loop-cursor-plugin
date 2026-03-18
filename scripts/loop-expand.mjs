#!/usr/bin/env node
/**
 * loop-expand — expand a prompt template over many items; write one .md per Agent run.
 * Placeholders: {{item}} {{index}} {{path}} {{relpath}} {{basename}}
 * Use \{{ for literal {{ in template.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import fg from "fast-glob";
import { minimatch } from "minimatch";

const MAX_ITEMS_DEFAULT = 500;

const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/coverage/**",
  "**/.cache/**",
  "**/target/**",
  "**/vendor/**",
];

function parseArgs(argv) {
  const out = {
    template: null,
    templateFile: null,
    values: null,
    valuesFile: null,
    dir: null,
    glob: ["**/*"],
    gitPath: null,
    projectRoot: process.cwd(),
    outDir: null,
    manifestPath: null,
    force: false,
    confirm: false,
    maxDepth: undefined,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--template") out.template = next();
    else if (a === "--template-file") out.templateFile = next();
    else if (a === "--values") out.values = next();
    else if (a === "--values-file") out.valuesFile = next();
    else if (a === "--dir") out.dir = next();
    else if (a === "--glob") {
      const g = next();
      if (out.glob.length === 1 && out.glob[0] === "**/*") out.glob = [g];
      else out.glob.push(g);
    }
    else if (a === "--git-path") out.gitPath = next();
    else if (a === "--project-root") out.projectRoot = path.resolve(next());
    else if (a === "--out") out.outDir = path.resolve(next());
    else if (a === "--manifest") out.manifestPath = path.resolve(next());
    else if (a === "--force") out.force = true;
    else if (a === "--confirm") out.confirm = true;
    else if (a === "--max-depth") out.maxDepth = parseInt(next(), 10);
    else {
      console.error("Unknown argument:", a);
      process.exit(1);
    }
  }
  return out;
}

function printHelp() {
  console.log(`
loop-expand — one prompt file per item for Cursor Agent loops

Placeholders: {{item}} {{index}} {{path}} {{relpath}} {{basename}}
Literal brace: \\{{

Usage:
  node scripts/loop-expand.mjs --template 'Fix {{relpath}}' --dir ./src --glob '**/*.ts'
  node scripts/loop-expand.mjs --template-file tpl.txt --values 'a,b,c'
  node scripts/loop-expand.mjs --template '...' --values-file list.txt
  node scripts/loop-expand.mjs --template '...' --values-file items.json  # JSON array
  node scripts/loop-expand.mjs --template 'Review {{relpath}}' --git-path src/

Options:
  --template TEXT          Template string
  --template-file PATH     Read template from file
  --values CSV             Comma-separated values
  --values-file PATH       Lines or JSON array
  --dir PATH               Walk directory (files only)
  --glob PATTERN           Include glob (repeatable), default **/*
  --git-path PREFIX        git ls-files under project root (tracked files)
  --project-root PATH      Repo root for --git-path (default cwd)
  --out DIR                Output dir (default <cwd>/.loop/prompts)
  --manifest PATH          manifest.json path (default <cwd>/.loop/manifest.json)
  --max-depth N            Max depth for --dir
  --force                  Overwrite existing outputs
  --confirm                Allow more than ${MAX_ITEMS_DEFAULT} items
  -h, --help
`);
}

function readTemplate(opts) {
  if (opts.templateFile) {
    return fs.readFileSync(opts.templateFile, "utf8");
  }
  if (opts.template != null) return opts.template;
  throw new Error("Provide --template or --template-file");
}

function parseValuesFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    const j = JSON.parse(raw);
    if (!Array.isArray(j)) throw new Error("JSON values file must be a JSON array");
    return j.map(String);
  }
  return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function collectListItems(opts) {
  if (opts.values != null) {
    return opts.values.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (opts.valuesFile) return parseValuesFile(opts.valuesFile);
  return null;
}

function collectDirItems(opts) {
  const root = path.resolve(opts.projectRoot, opts.dir);
  if (!fs.statSync(root).isDirectory()) throw new Error("--dir must be a directory");
  const patterns = opts.glob.map((g) => (path.isAbsolute(g) ? g : g));
  const entries = fg.sync(patterns, {
    cwd: root,
    onlyFiles: true,
    dot: false,
    ignore: DEFAULT_IGNORE,
    deep: opts.maxDepth != null ? opts.maxDepth : Infinity,
  });
  return entries.map((rel) => ({
    rel,
    abs: path.join(root, rel),
  }));
}

function collectGitItems(opts) {
  const root = opts.projectRoot;
  const prefix = (opts.gitPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const r = spawnSync("git", ["ls-files", "-z", "--", prefix || "."], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const err = r.stderr?.toString() || "git ls-files failed";
    throw new Error(err);
  }
  const buf = r.stdout;
  const names = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) {
      if (i > start) names.push(buf.subarray(start, i).toString("utf8"));
      start = i + 1;
    }
  }
  const files = names.filter((n) => {
    const full = path.join(root, n);
    try {
      return fs.statSync(full).isFile();
    } catch {
      return false;
    }
  });
  return files.map((rel) => ({
    rel: rel.split(path.sep).join("/"),
    abs: path.join(root, rel),
  }));
}

function slug(s, maxLen = 48) {
  const base = String(s)
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen) || "item";
  return base;
}

/**
 * Expand template: supports \{{ for literal {{, and placeholders.
 */
function expandTemplate(template, ctx) {
  const { item, index, filePath, relpath, basename } = ctx;
  let out = "";
  let i = 0;
  while (i < template.length) {
    if (template[i] === "\\" && template[i + 1] === "{" && template[i + 2] === "{") {
      out += "{{";
      i += 3;
      continue;
    }
    if (template[i] === "{" && template[i + 1] === "{") {
      const end = template.indexOf("}}", i + 2);
      if (end === -1) {
        out += template.slice(i);
        break;
      }
      const key = template.slice(i + 2, end).trim();
      const map = {
        item: String(item),
        index: String(index),
        path: filePath != null ? filePath : String(item),
        relpath: relpath != null ? relpath : String(item),
        basename: basename != null ? basename : String(item),
      };
      out += map[key] != null ? map[key] : `{{${key}}}`;
      i = end + 2;
      continue;
    }
    out += template[i];
    i++;
  }
  return out;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function preparePromptOutDir(outDir, force) {
  ensureDir(outDir);
  const existing = fs.readdirSync(outDir).filter((f) => f.endsWith(".md"));
  if (!existing.length) return;
  if (force) {
    for (const f of existing) fs.unlinkSync(path.join(outDir, f));
  } else {
    console.error(`Output dir not empty: ${outDir}. Use --force to overwrite.`);
    process.exit(1);
  }
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const listItems = collectListItems(opts);
  const hasDir = !!opts.dir;

  let mode = null;
  if (listItems != null) mode = "list";
  else if (hasDir) mode = "dir";
  else if (process.argv.includes("--git-path")) mode = "git";
  else {
    console.error("Provide one of: --values / --values-file, --dir, or --git-path");
    printHelp();
    process.exit(1);
  }

  const template = readTemplate(opts);
  const projectRoot = opts.projectRoot;
  const loopDir = path.join(projectRoot, ".loop");
  const outDir = opts.outDir || path.join(loopDir, "prompts");
  const manifestPath = opts.manifestPath || path.join(loopDir, "manifest.json");

  /** @type {{ index: number, item: string, file: string, path?: string, relpath?: string, done: boolean }[]} */
  const manifest = [];

  if (mode === "list") {
    if (!listItems.length) {
      console.error("No values to expand.");
      process.exit(1);
    }
    if (!opts.confirm && listItems.length > MAX_ITEMS_DEFAULT) {
      console.error(
        `Refusing ${listItems.length} items (>${MAX_ITEMS_DEFAULT}). Use --confirm to allow.`
      );
      process.exit(1);
    }
    preparePromptOutDir(outDir, opts.force);
    listItems.forEach((item, idx) => {
      const index = idx + 1;
      const name = `${String(index).padStart(3, "0")}-${slug(item)}.md`;
      const body = expandTemplate(template, {
        item,
        index,
        filePath: item,
        relpath: item,
        basename: path.basename(String(item)),
      });
      fs.writeFileSync(path.join(outDir, name), body, "utf8");
      manifest.push({ index, item, file: name, done: false });
    });
  } else if (mode === "dir") {
    const fileEntries = collectDirItems(opts);
    if (!fileEntries.length) {
      console.error("No files matched under --dir.");
      process.exit(1);
    }
    if (!opts.confirm && fileEntries.length > MAX_ITEMS_DEFAULT) {
      console.error(
        `Refusing ${fileEntries.length} files (>${MAX_ITEMS_DEFAULT}). Use --confirm to allow.`
      );
      process.exit(1);
    }
    preparePromptOutDir(outDir, opts.force);
    fileEntries.forEach((e, idx) => {
      const index = idx + 1;
      const relpath = e.rel.split(path.sep).join("/");
      const name = `${String(index).padStart(3, "0")}-${slug(relpath)}.md`;
      const body = expandTemplate(template, {
        item: e.abs,
        index,
        filePath: e.abs,
        relpath,
        basename: path.basename(e.abs),
      });
      fs.writeFileSync(path.join(outDir, name), body, "utf8");
      manifest.push({
        index,
        item: e.abs,
        file: name,
        path: e.abs,
        relpath,
        done: false,
      });
    });
  } else if (mode === "git") {
    const gitPrefix = opts.gitPath === undefined ? "." : opts.gitPath;
    const optsGit = { ...opts, gitPath: gitPrefix };
    const fileEntries = collectGitItems(optsGit);
    let filtered = fileEntries;
    if (opts.glob && opts.glob.length && !(opts.glob.length === 1 && opts.glob[0] === "**/*")) {
      filtered = fileEntries.filter((e) =>
        opts.glob.some((pattern) => minimatch(e.rel, pattern, { dot: true }))
      );
    }
    if (!filtered.length) {
      console.error("No git files matched.");
      process.exit(1);
    }
    if (!opts.confirm && filtered.length > MAX_ITEMS_DEFAULT) {
      console.error(
        `Refusing ${filtered.length} files (>${MAX_ITEMS_DEFAULT}). Use --confirm to allow.`
      );
      process.exit(1);
    }
    preparePromptOutDir(outDir, opts.force);
    filtered.forEach((e, idx) => {
      const index = idx + 1;
      const relpath = e.rel;
      const name = `${String(index).padStart(3, "0")}-${slug(relpath)}.md`;
      const body = expandTemplate(template, {
        item: e.abs,
        index,
        filePath: e.abs,
        relpath,
        basename: path.basename(e.abs),
      });
      fs.writeFileSync(path.join(outDir, name), body, "utf8");
      manifest.push({
        index,
        item: e.abs,
        file: name,
        path: e.abs,
        relpath,
        done: false,
      });
    });
  }

  const state = {
    version: 1,
    template,
    outDir: path.relative(projectRoot, outDir) || outDir,
    manifestPath: path.relative(projectRoot, manifestPath) || manifestPath,
    items: manifest,
    updatedAt: new Date().toISOString(),
  };
  ensureDir(path.dirname(manifestPath));
  fs.writeFileSync(manifestPath, JSON.stringify({ items: manifest }, null, 2), "utf8");
  fs.writeFileSync(path.join(loopDir, "state.json"), JSON.stringify(state, null, 2), "utf8");

  console.log(`Wrote ${manifest.length} prompts to ${outDir}`);
  console.log(`Manifest: ${manifestPath}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
