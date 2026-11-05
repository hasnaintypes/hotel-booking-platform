import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UniqueViolationError } from "../../common/errors/postgres-errors";
import { hashPassword } from "../../common/security/password";
import { BOOKING_MODEL } from "../../database/models";
import {
  toPublicUser,
  UsersRepository,
  type PublicUser,
} from "../../database/repositories/users.repository";
import { RegisterDto } from "./dto/register.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";

type BookingStats = { _id: string; totalBookings: number; totalSpent: number };

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly jwtService: JwtService,
    @InjectModel(BOOKING_MODEL) private readonly bookingModel: Model<any>,
  ) {}

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new BadRequestException("User not found");
    }
    return toPublicUser(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
    const user = await this.users.updateProfile(userId, dto);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return toPublicUser(user);
  }

  async findAll() {
    const rows = await this.users.list();
    if (rows.length === 0) return [];

    const stats = (await this.bookingModel.aggregate([
      { $match: { userId: { $in: rows.map((user) => user.id) } } },
      {
        $group: {
          _id: "$userId",
          totalBookings: { $sum: 1 },
          totalSpent: { $sum: "$totalCost" },
        },
      },
    ])) as BookingStats[];
    const byUser = new Map(stats.map((row) => [row._id, row]));

    return rows.map((user) => ({
      ...toPublicUser(user),
      totalBookings: byUser.get(user.id)?.totalBookings ?? 0,
      totalSpent: byUser.get(user.id)?.totalSpent ?? 0,
    }));
  }

  async updateRole(id: string, dto: UpdateRoleDto, actorId: string) {
    if (id === actorId && dto.role !== "admin") {
      throw new BadRequestException("Cannot demote your own admin role");
    }

    const user = await this.users.updateRole(id, dto.role);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    return toPublicUser(user);
  }

  async register(dto: RegisterDto) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException("User already exists");
    }

    let user;
    try {
      user = await this.users.createWithPassword({
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        passwordHash: await hashPassword(dto.password),
      });
    } catch (error) {
      // The unique index is the real guard: two simultaneous registrations can both pass the
      // check above, and exactly one of them inserts.
      if (error instanceof UniqueViolationError) {
        throw new ConflictException("User already exists");
      }
      throw error;
    }

    const token = this.jwtService.sign({ userId: user.id });
    return { token, user: toPublicUser(user) };
  }
}
