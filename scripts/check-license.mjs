// Fails when LICENSE is missing or when any workspace package.json disagrees on the licence.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const EXPECTED = "MIT";
const errors = [];

const licensePath = join(root, "LICENSE");
if (!existsSync(licensePath)) {
  errors.push("LICENSE is missing");
} else {
  const text = readFileSync(licensePath, "utf8");
  if (!text.startsWith("MIT License")) errors.push("LICENSE does not start with 'MIT License'");
  if (!/^Copyright \(c\) \d{4} \S/m.test(text)) errors.push("LICENSE has no copyright line");
}

const manifests = [join(root, "package.json")];
for (const group of ["apps", "packages"]) {
  const dir = join(root, group);
  if (!existsSync(dir)) continue;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const manifest = join(dir, entry.name, "package.json");
    if (entry.isDirectory() && existsSync(manifest)) manifests.push(manifest);
  }
}

for (const manifest of manifests) {
  const { license } = JSON.parse(readFileSync(manifest, "utf8"));
  if (license !== EXPECTED) {
    const rel = manifest.slice(root.length + 1);
    errors.push(`${rel}: license is ${JSON.stringify(license)}, expected "${EXPECTED}"`);
  }
}

if (errors.length > 0) {
  console.error("License check failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`License check passed (${manifests.length} package.json files, LICENSE present).`);
