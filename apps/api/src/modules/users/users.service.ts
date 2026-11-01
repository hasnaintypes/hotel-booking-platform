import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { JwtService } from "@nestjs/jwt";
import { Model } from "mongoose";
import { UserType } from "@hotel-booking/types";
import { USER_MODEL } from "../../database/models";
import { RegisterDto } from "./dto/register.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(USER_MODEL) private readonly userModel: Model<UserType>,
    private readonly jwtService: JwtService,
  ) {}

  async me(userId: string) {
    const user = await this.userModel.findById(userId).select("-password");
    if (!user) {
      throw new BadRequestException("User not found");
    }
    return user;
  }

  findAll() {
    return this.userModel
      .find()
      .select("email firstName lastName role isActive totalBookings totalSpent createdAt")
      .sort({ createdAt: -1 })
      .limit(200);
  }

  async updateRole(id: string, dto: UpdateRoleDto, actorId: string) {
    if (id === actorId && dto.role !== "admin") {
      throw new BadRequestException("Cannot demote your own admin role");
    }

    const user = await this.userModel
      .findByIdAndUpdate(id, { role: dto.role, updatedAt: new Date() }, { new: true })
      .select("-password");

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  async register(dto: RegisterDto) {
    const existing = await this.userModel.findOne({ email: dto.email });
    if (existing) {
      throw new ConflictException("User already exists");
    }

    const user = new this.userModel(dto);
    await user.save();

    const token = this.jwtService.sign({ userId: user.id });
    const created = user.toObject() as Record<string, unknown>;
    delete created.password;
    return { token, user: created };
  }
}
