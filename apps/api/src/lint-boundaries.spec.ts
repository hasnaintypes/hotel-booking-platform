import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const lintModuleFile = async (source: string) => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(source, {
    filePath: "src/modules/leak/leak.service.ts",
  });
  return result.messages;
};

describe("module import boundaries", () => {
  it("rejects another module's internal schema", async () => {
    const messages = await lintModuleFile(
      'import { Secret } from "../other/schemas/secret.schema";\nexport const secret = Secret;',
    );
    expect(messages.some((message) => message.ruleId === "no-restricted-imports")).toBe(true);
  });

  it("rejects another module's repository", async () => {
    const messages = await lintModuleFile(
      'import { LeakRepository } from "../other/repositories/leak.repository";\nexport const repo = LeakRepository;',
    );
    expect(messages.some((message) => message.ruleId === "no-restricted-imports")).toBe(true);
  });

  it("allows another module's exported service", async () => {
    const messages = await lintModuleFile(
      'import { OtherService } from "../other/other.service";\nexport const service = OtherService;',
    );
    expect(messages.filter((message) => message.ruleId === "no-restricted-imports")).toEqual([]);
  });

  it("rejects booking code importing an inventory provider implementation", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const [result] = await eslint.lintText(
      'import { ManagedInventoryProvider } from "../inventory/providers/managed-inventory.provider";\nexport const provider = ManagedInventoryProvider;',
      { filePath: "src/modules/bookings/leak.service.ts" },
    );
    expect(result.messages.some((message) => message.ruleId === "no-restricted-imports")).toBe(
      true,
    );
  });
});
