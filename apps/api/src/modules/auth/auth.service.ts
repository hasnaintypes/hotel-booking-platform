import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { bcryptCost, hashPassword, needsRehash } from "../../common/security/password";
import { UsersRepository } from "../../database/repositories/users.repository";
import { LoginDto } from "./dto/login.dto";
import { LoginAttemptTracker } from "./login-attempts";

let dummyHashPromise: Promise<string> | undefined;
/** A valid hash of a throwaway string, made once, to compare against when no account matches. */
const dummyHash = () => (dummyHashPromise ??= bcrypt.hash("no-such-account", bcryptCost()));

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly jwtService: JwtService,
    private readonly attempts: LoginAttemptTracker,
  ) {}

  async login(dto: LoginDto) {
    this.attempts.assertNotLocked(dto.email);

    const account = await this.users.findForLogin(dto.email);
    const passwordHash = account?.passwordHash;

    // Always run one bcrypt comparison, even for an unknown address, so the response time does
    // not reveal whether an account exists.
    const isMatch = await bcrypt.compare(dto.password, passwordHash || (await dummyHash()));
    if (!account || !passwordHash || !isMatch) {
      this.attempts.recordFailure(dto.email);
      throw new BadRequestException("Invalid Credentials");
    }

    const user = account.user;
    // Only said once the password is right, so it does not reveal which addresses are registered.
    if (user.status !== "active") {
      throw new ForbiddenException("This account has been deactivated");
    }

    this.attempts.clear(dto.email);
    await this.upgradePasswordHash(user.id, passwordHash, dto.password);

    const token = this.jwtService.sign({ userId: user.id });

    return {
      userId: user.id,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
      },
    };
  }

  /** Re-hashes a password made with a lower cost, now that the plain text is at hand. */
  private async upgradePasswordHash(userId: string, currentHash: string, password: string) {
    if (!needsRehash(currentHash)) return;
    try {
      await this.users.updatePasswordHash(userId, await hashPassword(password));
    } catch {
      // The sign-in itself succeeded; the hash is upgraded next time.
      this.logger.warn("Could not upgrade a password hash");
    }
  }
}
