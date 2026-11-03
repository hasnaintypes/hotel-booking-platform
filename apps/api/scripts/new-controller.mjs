#!/usr/bin/env node
import { error, log } from "node:console";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";

const AUDIENCES = new Set(["public", "manage", "admin", "partner"]);

const usage = `Usage: pnpm --filter @hotel-booking/api gen:controller <audience> <resource-path> [ClassName]

  audience       public | manage | admin | partner
  resource-path  resource-only path, e.g. hotels or bookings/:bookingId/reviews
  ClassName      optional controller class name (default: <Resource>Controller)

The global /api and version 1 prefixes are applied by configureApp; never include them here.
Register the generated controller in src/routes/<audience>.routes.module.ts.`;

const [audience, resource, explicitName] = process.argv.slice(2);

if (!audience || !resource || !AUDIENCES.has(audience)) {
  error(usage);
  process.exit(1);
}

if (/^\/?(api|v\d+)(\/|$)/.test(resource)) {
  error("Error: controllers declare resource-only paths; do not include api/ or a version.");
  process.exit(1);
}

const pascal = (value) =>
  value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");

const lastSegment = resource.split("/").filter(Boolean).pop();
const className = explicitName ?? `${pascal(lastSegment ?? "resource")}Controller`;
const fileName = `${className
  .replace(/Controller$/, "")
  .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
  .toLowerCase()}.controller.ts`;
const target = join("src", "modules", lastSegment ?? "resource", fileName);

const template = `import { Body, Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";

@Controller("${resource}")
export class ${className} {
  @Get()
  findAll() {
    return [];
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown) {
    return body;
  }
}
`;

try {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, template, { flag: "wx" });
  log(`Created ${target}`);
  log(`Next: add ${className} to src/routes/${audience}.routes.module.ts`);
} catch (error) {
  if (error?.code === "EEXIST") {
    error(`Error: ${target} already exists; choose another resource or class name.`);
  } else {
    error(error);
  }
  process.exit(1);
}
