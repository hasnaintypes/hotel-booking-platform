import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectModel } from "@nestjs/mongoose";
import bcrypt from "bcryptjs";
import { Model } from "mongoose";
import { UserType } from "@hotel-booking/types";
import { bcryptCost, hashPassword, needsRehash } from "../../common/security/password";
import { USER_MODEL } from "../../database/models";
import { LoginDto } from "./dto/login.dto";
import { LoginAttemptTracker } from "./login-attempts";

let dummyHashPromise: Promise<string> | undefined;
/** A valid hash of a throwaway string, made once, to compare against when no account matches. */
const dummyHash = () => (dummyHashPromise ??= bcrypt.hash("no-such-account", bcryptCost()));

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(USER_MODEL) private readonly userModel: Model<UserType>,
    private readonly jwtService: JwtService,
    private readonly attempts: LoginAttemptTracker,
  ) {}

  async login(dto: LoginDto) {
    this.attempts.assertNotLocked(dto.email);

    const user = await this.userModel.findOne({ email: dto.email });

    // Always run one bcrypt comparison, even for an unknown address, so the response time does
    // not reveal whether an account exists.
    const isMatch = await bcrypt.compare(dto.password, user?.password || (await dummyHash()));
    if (!user || !user.password || !isMatch) {
      this.attempts.recordFailure(dto.email);
      throw new BadRequestException("Invalid Credentials");
    }

    // Only said once the password is right, so it does not reveal which addresses are registered.
    if (user.isActive === false) {
      throw new ForbiddenException("This account has been deactivated");
    }

    this.attempts.clear(dto.email);
    await this.upgradePasswordHash(user._id, user.password, dto.password);

    const token = this.jwtService.sign({ userId: user.id });

    return {
      userId: user._id,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  /** Re-hashes a password made with a lower cost, now that the plain text is at hand. */
  private async upgradePasswordHash(userId: unknown, currentHash: string, password: string) {
    if (!needsRehash(currentHash)) return;
    try {
      await this.userModel.updateOne(
        { _id: userId },
        { $set: { password: await hashPassword(password) } },
      );
    } catch {
      // The sign-in itself succeeded; the hash is upgraded next time.
      this.logger.warn("Could not upgrade a password hash");
    }
  }
}
