#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const maxLines = Number(process.argv[2] ?? 450);
const scanRoots = process.argv.slice(3);
const ignoredDirectories = new Set([
  ".git",
  "dist",
  "node_modules",
  "server/projects",
  "server/tools",
]);
const sourceExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath);

    if (entry.isDirectory()) {
      if (ignoredDirectories.has(relativePath) || ignoredDirectories.has(entry.name)) {
        continue;
      }

      files.push(...(await collectFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }

  return files;
}

const rootDirectories = scanRoots.length > 0 ? scanRoots : ["."];
const files = (
  await Promise.all(rootDirectories.map((directory) => collectFiles(path.resolve(root, directory))))
).flat();
const oversized = [];

for (const file of files) {
  const content = await readFile(file, "utf8");
  const lines = content.split(/\r?\n/).length;

  if (lines > maxLines) {
    oversized.push({
      path: path.relative(root, file),
      lines,
    });
  }
}

oversized.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));

if (oversized.length === 0) {
  console.log(`No source files over ${maxLines} lines.`);
  process.exit(0);
}

console.log(`Source files over ${maxLines} lines:`);

for (const file of oversized) {
  console.log(`${String(file.lines).padStart(5, " ")}  ${file.path}`);
}
