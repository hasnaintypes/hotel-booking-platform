import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const LIMITS = {
  raw: 430 * 1024,
  gzip: 140 * 1024,
};

const APPS = ["apps/web", "apps/admin"];
let failed = false;

for (const app of APPS) {
  const assetsDir = join(app, "dist", "assets");
  let entries;

  try {
    entries = readdirSync(assetsDir);
  } catch {
    console.error(`Missing build output: ${assetsDir}`);
    failed = true;
    continue;
  }

  const entry = entries.find((file) => /^index-.*\.js$/.test(file));
  if (!entry) {
    console.error(`No entry bundle found in ${assetsDir}`);
    failed = true;
    continue;
  }

  const contents = readFileSync(join(assetsDir, entry));
  const raw = contents.byteLength;
  const gzip = gzipSync(contents).byteLength;
  const label = `${app}/dist/assets/${entry}`;

  if (raw > LIMITS.raw || gzip > LIMITS.gzip) {
    console.error(
      `Bundle budget exceeded: ${label} is ${format(raw)} raw / ${format(gzip)} gzip ` +
        `(max ${format(LIMITS.raw)} / ${format(LIMITS.gzip)})`,
    );
    failed = true;
  } else {
    console.log(`Bundle OK: ${label} — ${format(raw)} raw / ${format(gzip)} gzip`);
  }
}

if (failed) process.exit(1);

function format(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}
