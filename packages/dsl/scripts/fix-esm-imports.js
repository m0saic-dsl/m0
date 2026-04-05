#!/usr/bin/env node
/**
 * Post-build: fix relative imports in ESM output to include .js extensions.
 * Node.js ESM requires explicit file extensions; TypeScript doesn't emit them.
 */
const fs = require("fs");
const path = require("path");

const ESM_DIR = path.join(__dirname, "..", "dist", "esm");

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

function fixImports(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  const dir = path.dirname(filePath);

  // Match: from "./foo" or export * from "./bar"
  content = content.replace(
    /(from\s+["'])(\.\.?\/[^"']+)(["'])/g,
    (match, pre, specifier, post) => {
      // Already has extension
      if (/\.\w+$/.test(specifier)) return match;

      // Check if it's a directory (needs /index.js)
      const asDir = path.resolve(dir, specifier);
      if (fs.existsSync(asDir) && fs.statSync(asDir).isDirectory()) {
        return `${pre}${specifier}/index.js${post}`;
      }

      // Otherwise add .js
      return `${pre}${specifier}.js${post}`;
    }
  );

  fs.writeFileSync(filePath, content);
}

const files = walk(ESM_DIR);
for (const f of files) fixImports(f);
console.log(`Fixed ESM imports in ${files.length} files.`);
