import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrations = join(root, "migrations");

const snapshot = (dir) => {
  const files = new Map();
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      else files.set(path.slice(dir.length), readFileSync(path, "utf8"));
    }
  };
  walk(dir);
  return files;
};

const before = snapshot(migrations);
const backup = mkdtempSync(join(tmpdir(), "drizzle-migrations-"));
cpSync(migrations, backup, { recursive: true });

try {
  execFileSync("drizzle-kit", ["generate", "--name", "drift_check"], {
    cwd: root,
    stdio: "pipe",
  });
} catch (error) {
  rmSync(backup, { recursive: true, force: true });
  console.error("drizzle-kit generate failed while checking drift");
  console.error(error.stderr?.toString() ?? error.message);
  process.exit(1);
}

const after = snapshot(migrations);
rmSync(migrations, { recursive: true, force: true });
cpSync(backup, migrations, { recursive: true });
rmSync(backup, { recursive: true, force: true });

const changed =
  before.size !== after.size || [...before].some(([path, content]) => after.get(path) !== content);

if (changed) {
  console.error("Schema drift: the schema has changes without a committed migration.");
  console.error("Run `pnpm db:generate` and commit the generated migration.");
  process.exit(1);
}

console.log("No schema drift.");
