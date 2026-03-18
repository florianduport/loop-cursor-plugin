#!/usr/bin/env node
/**
 * Optional MCP server for loop-prompt: expand, status, next prompt, mark done.
 * All paths constrained under projectRoot/.loop/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, "..", "scripts", "loop-expand.mjs");

function resolveProjectRoot(raw) {
  const abs = path.resolve(raw);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`projectRoot is not a directory: ${raw}`);
  }
  return abs;
}

function loopDir(root) {
  return path.join(root, ".loop");
}

function readManifest(root) {
  const p = path.join(loopDir(root), "manifest.json");
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return j.items && Array.isArray(j.items) ? j : null;
}

function writeManifest(root, items) {
  const dir = loopDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "manifest.json");
  fs.writeFileSync(p, JSON.stringify({ items }, null, 2), "utf8");
  const statePath = path.join(dir, "state.json");
  let state = { version: 1, items, updatedAt: new Date().toISOString() };
  if (fs.existsSync(statePath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(statePath, "utf8"));
      if (prev.template) state.template = prev.template;
      if (prev.outDir) state.outDir = prev.outDir;
      if (prev.manifestPath) state.manifestPath = prev.manifestPath;
    } catch {
      /* ignore */
    }
  }
  state.items = items;
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

function runExpand(projectRoot, args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    ok: r.status === 0,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    status: r.status,
  };
}

const mcpServer = new McpServer({
  name: "loop-prompt",
  version: "1.0.0",
});

mcpServer.registerTool(
  "loop_status",
  {
    description:
      "Summarize loop progress: total items, done count, next index. Reads projectRoot/.loop/manifest.json.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the workspace / git repo root"),
    },
  },
  async ({ projectRoot }) => {
    const root = resolveProjectRoot(projectRoot);
    const m = readManifest(root);
    if (!m) {
      return {
        content: [{ type: "text", text: "No manifest found. Run loop_expand first." }],
      };
    }
    const items = m.items;
    const total = items.length;
    const done = items.filter((i) => i.done).length;
    const remaining = total - done;
    const next = items.find((i) => !i.done);
    const lines = [
      "========== LOOP STATUS ==========",
      `Progress: ${done} done / ${total} total (${remaining} remaining)`,
      next
        ? `Next up:  item #${next.index} of ${total}  →  ${next.file}`
        : "Next up:  (none — loop complete)",
      "=================================",
      "",
      "(Machine-readable)",
      JSON.stringify(
        {
          total,
          done,
          remaining,
          nextIndex: next ? next.index : null,
          nextFile: next ? next.file : null,
        },
        null,
        2
      ),
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

mcpServer.registerTool(
  "loop_expand",
  {
    description:
      "Expand a template into .loop/prompts/*.md and manifest. Same as loop-expand CLI. Requires template or templateFile and exactly one source: list, dir, or git.",
    inputSchema: {
      projectRoot: z.string().describe("Workspace root (cwd for the CLI)"),
      template: z.string().optional().describe("Template string with {{item}} {{index}} {{path}} {{relpath}} {{basename}}"),
      templateFile: z.string().optional().describe("Path to template file (relative to projectRoot or absolute)"),
      sourceType: z.enum(["list", "dir", "git"]),
      values: z.string().optional().describe("Comma-separated list (sourceType=list)"),
      valuesFile: z.string().optional().describe("Path to lines or JSON array file"),
      dir: z.string().optional().describe("Directory to walk (sourceType=dir)"),
      glob: z.array(z.string()).optional().describe("Include globs; default **/*"),
      gitPath: z.string().optional().describe("Prefix for git ls-files (sourceType=git), e.g. src/"),
      force: z.boolean().optional().describe("Overwrite existing prompt .md files"),
      confirm: z.boolean().optional().describe("Allow >500 items"),
    },
  },
  async (input) => {
    const root = resolveProjectRoot(input.projectRoot);
    const args = ["--project-root", root];
    if (input.templateFile) {
      const tf = path.isAbsolute(input.templateFile)
        ? input.templateFile
        : path.join(root, input.templateFile);
      args.push("--template-file", tf);
    } else if (input.template != null) {
      args.push("--template", input.template);
    } else {
      return {
        content: [{ type: "text", text: "Error: provide template or templateFile" }],
        isError: true,
      };
    }
    if (input.sourceType === "list") {
      if (input.values) args.push("--values", input.values);
      else if (input.valuesFile) {
        const vf = path.isAbsolute(input.valuesFile)
          ? input.valuesFile
          : path.join(root, input.valuesFile);
        args.push("--values-file", vf);
      } else {
        return {
          content: [{ type: "text", text: "Error: list source needs values or valuesFile" }],
          isError: true,
        };
      }
    } else if (input.sourceType === "dir") {
      if (!input.dir) {
        return {
          content: [{ type: "text", text: "Error: dir source needs dir" }],
          isError: true,
        };
      }
      args.push("--dir", input.dir);
      if (input.glob?.length) {
        for (const g of input.glob) args.push("--glob", g);
      }
    } else if (input.sourceType === "git") {
      args.push("--git-path", input.gitPath != null ? input.gitPath : ".");
      if (input.glob?.length) {
        for (const g of input.glob) args.push("--glob", g);
      }
    }
    if (input.force) args.push("--force");
    if (input.confirm) args.push("--confirm");
    const r = runExpand(root, args);
    const tail = r.ok
      ? "\n\n---\nNext: call loop_next_prompt(projectRoot) to fetch item 1 of N, or open .loop/prompts/001-*.md manually."
      : "";
    const msg = r.ok
      ? `${r.stdout || "OK"}${tail}`
      : `${r.stderr}\n${r.stdout}`.trim() || `exit ${r.status}`;
    return {
      content: [{ type: "text", text: msg }],
      isError: !r.ok,
    };
  }
);

mcpServer.registerTool(
  "loop_next_prompt",
  {
    description:
      "Return the full prompt text for the next incomplete item (reads the .md file under .loop/prompts/).",
    inputSchema: {
      projectRoot: z.string(),
    },
  },
  async ({ projectRoot }) => {
    const root = resolveProjectRoot(projectRoot);
    const m = readManifest(root);
    if (!m) {
      return {
        content: [{ type: "text", text: "No manifest. Run loop_expand first." }],
        isError: true,
      };
    }
    const items = m.items;
    const total = items.length;
    const done = items.filter((i) => i.done).length;
    const next = items.find((i) => !i.done);
    if (!next) {
      return {
        content: [
          {
            type: "text",
            text: [
              "========== LOOP COMPLETE ==========",
              `All ${total} items are marked done.`,
              "No further loop_next_prompt calls needed.",
              "Run loop_expand again to start a new loop.",
              "====================================",
            ].join("\n"),
          },
        ],
      };
    }
    const mdPath = path.join(loopDir(root), "prompts", next.file);
    if (!fs.existsSync(mdPath)) {
      return {
        content: [{ type: "text", text: `Missing file: ${mdPath}` }],
        isError: true,
      };
    }
    const body = fs.readFileSync(mdPath, "utf8");
    const step = done + 1;
    const itemLabel = next.relpath ?? next.item ?? String(next.index);
    const text = [
      "================================================================================",
      `  LOOP  —  ITEM ${step} OF ${total}  (manifest index ${next.index})`,
      `  File: ${next.file}`,
      `  Scope: ${itemLabel}`,
      "================================================================================",
      "",
      ">>> EXECUTE ONLY THIS PROMPT FOR THIS STEP:",
      "",
      body.trimEnd(),
      "",
      "================================================================================",
      ">>> WHEN FINISHED: call loop_mark_done(projectRoot, index: " +
        next.index +
        "), then loop_next_prompt for the next item.",
      "================================================================================",
    ].join("\n");
    return {
      content: [{ type: "text", text }],
    };
  }
);

mcpServer.registerTool(
  "loop_mark_done",
  {
    description: "Mark a manifest item as done after its Agent chat completed.",
    inputSchema: {
      projectRoot: z.string(),
      index: z.number().int().positive().describe("1-based index from manifest"),
    },
  },
  async ({ projectRoot, index }) => {
    const root = resolveProjectRoot(projectRoot);
    const m = readManifest(root);
    if (!m) {
      return {
        content: [{ type: "text", text: "No manifest." }],
        isError: true,
      };
    }
    const items = m.items.map((i) =>
      i.index === index ? { ...i, done: true } : i
    );
    if (!items.some((i) => i.index === index)) {
      return {
        content: [{ type: "text", text: `No item with index ${index}` }],
        isError: true,
      };
    }
    writeManifest(root, items);
    const total = items.length;
    const doneNow = items.filter((i) => i.done).length;
    const left = total - doneNow;
    const lines =
      left === 0
        ? [
            "========== ITEM MARKED DONE ==========",
            `Finished item ${index} of ${total}.`,
            "",
            "*** LOOP COMPLETE ***",
            `All ${total} items done. Stop calling loop_next_prompt.`,
            "======================================",
          ]
        : [
            "========== ITEM MARKED DONE ==========",
            `Finished item ${index} of ${total}.`,
            `Progress: ${doneNow}/${total} complete  |  ${left} remaining`,
            "",
            `Next: call loop_next_prompt(projectRoot) for item ${doneNow + 1} of ${total}.`,
            "======================================",
          ];
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
