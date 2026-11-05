import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitedException } from "../../common/errors/rate-limited.exception";
import { AuthService } from "./auth.service";
import { LoginAttemptTracker } from "./login-attempts";

const PASSWORD = "a-perfectly-fine-password";

describe("AuthService.login", () => {
  let hash: string;
  let users: {
    findForLogin: ReturnType<typeof vi.fn>;
    updatePasswordHash: ReturnType<typeof vi.fn>;
  };
  let service: AuthService;
  let attempts: LoginAttemptTracker;

  const account = (overrides: Record<string, unknown> = {}) => ({
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "a@x.test",
      firstName: "A",
      lastName: "B",
      status: "active",
      ...overrides,
    },
    passwordHash: hash,
  });

  beforeEach(() => {
    vi.stubEnv("BCRYPT_COST", "6");
    hash = bcrypt.hashSync(PASSWORD, 6);
    users = {
      findForLogin: vi.fn(),
      updatePasswordHash: vi.fn().mockResolvedValue(undefined),
    };
    const config = {
      get: (key: string) => ({ "auth.maxFailedLogins": 3 })[key],
    } as unknown as ConfigService;
    attempts = new LoginAttemptTracker(config);
    service = new AuthService(
      users as never,
      { sign: () => "token" } as unknown as JwtService,
      attempts,
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("timing", () => {
    it("still runs a bcrypt comparison when the address is unknown", async () => {
      users.findForLogin.mockResolvedValue(undefined);
      const compare = vi.spyOn(bcrypt, "compare");

      await expect(service.login({ email: "nobody@x.test", password: PASSWORD })).rejects.toThrow(
        BadRequestException,
      );

      expect(compare).toHaveBeenCalledTimes(1);
      // Compared against a real bcrypt hash, so it costs the same as a genuine comparison.
      expect(String(compare.mock.calls[0][1])).toMatch(/^\$2[aby]\$/);
    });

    it("runs exactly one comparison for a known account with a wrong password", async () => {
      users.findForLogin.mockResolvedValue(account());
      const compare = vi.spyOn(bcrypt, "compare");

      await expect(service.login({ email: "a@x.test", password: "wrong" })).rejects.toThrow(
        BadRequestException,
      );

      expect(compare).toHaveBeenCalledTimes(1);
    });

    it("gives the same answer for an unknown address and a wrong password", async () => {
      users.findForLogin.mockResolvedValueOnce(undefined).mockResolvedValueOnce(account());

      const unknown = await service.login({ email: "n@x.test", password: "x" }).catch((e) => e);
      const wrong = await service.login({ email: "a@x.test", password: "x" }).catch((e) => e);

      expect(unknown.message).toBe("Invalid Credentials");
      expect(wrong.message).toBe(unknown.message);
      expect(wrong.getStatus()).toBe(unknown.getStatus());
    });
  });

  describe("account state", () => {
    it("refuses a deactivated account only after the password is right", async () => {
      users.findForLogin.mockResolvedValue(account({ status: "suspended" }));

      await expect(service.login({ email: "a@x.test", password: PASSWORD })).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.login({ email: "a@x.test", password: "wrong" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("does not upgrade the hash of an account it refuses", async () => {
      vi.stubEnv("BCRYPT_COST", "8");
      users.findForLogin.mockResolvedValue(account({ status: "suspended" }));

      await expect(service.login({ email: "a@x.test", password: PASSWORD })).rejects.toThrow();

      expect(users.updatePasswordHash).not.toHaveBeenCalled();
    });
  });

  describe("lockout", () => {
    it("locks the account after repeated failures, even for the right password", async () => {
      users.findForLogin.mockResolvedValue(account());
      for (let i = 0; i < 3; i += 1) {
        await expect(service.login({ email: "a@x.test", password: "wrong" })).rejects.toThrow(
          BadRequestException,
        );
      }

      await expect(service.login({ email: "a@x.test", password: PASSWORD })).rejects.toBeInstanceOf(
        RateLimitedException,
      );
    });

    it("counts failures for unknown addresses too", async () => {
      users.findForLogin.mockResolvedValue(undefined);
      for (let i = 0; i < 3; i += 1) {
        await service.login({ email: "ghost@x.test", password: "x" }).catch(() => undefined);
      }

      await expect(service.login({ email: "ghost@x.test", password: "x" })).rejects.toBeInstanceOf(
        RateLimitedException,
      );
    });

    it("forgets earlier failures once the sign-in succeeds", async () => {
      users.findForLogin.mockResolvedValue(account());
      await service.login({ email: "a@x.test", password: "wrong" }).catch(() => undefined);
      await service.login({ email: "a@x.test", password: "wrong" }).catch(() => undefined);

      await expect(service.login({ email: "a@x.test", password: PASSWORD })).resolves.toBeDefined();

      for (let i = 0; i < 2; i += 1) {
        await expect(service.login({ email: "a@x.test", password: "wrong" })).rejects.toThrow(
          BadRequestException,
        );
      }
    });
  });

  describe("upgrading the password hash", () => {
    it("re-hashes a password stored with a lower cost", async () => {
      vi.stubEnv("BCRYPT_COST", "8");
      users.findForLogin.mockResolvedValue(account());

      await service.login({ email: "a@x.test", password: PASSWORD });

      expect(users.updatePasswordHash).toHaveBeenCalledTimes(1);
      const [userId, newHash] = users.updatePasswordHash.mock.calls[0];
      expect(userId).toBe("11111111-1111-4111-8111-111111111111");
      expect(bcrypt.getRounds(newHash)).toBe(8);
      expect(await bcrypt.compare(PASSWORD, newHash)).toBe(true);
    });

    it("leaves a hash that is already strong enough", async () => {
      users.findForLogin.mockResolvedValue(account());
      await service.login({ email: "a@x.test", password: PASSWORD });
      expect(users.updatePasswordHash).not.toHaveBeenCalled();
    });

    it("still signs the user in when the upgrade cannot be saved", async () => {
      vi.stubEnv("BCRYPT_COST", "8");
      users.findForLogin.mockResolvedValue(account());
      users.updatePasswordHash.mockRejectedValue(new Error("db down"));

      await expect(service.login({ email: "a@x.test", password: PASSWORD })).resolves.toMatchObject(
        {
          message: "Login successful",
        },
      );
    });
  });
});
