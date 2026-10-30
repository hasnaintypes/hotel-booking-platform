import { Controller, Get, Res, UseGuards } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Response } from "express";
import { Connection } from "mongoose";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@Controller("api/health")
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  check(@Res({ passthrough: true }) res: Response) {
    const dbStatus = this.connection.readyState === 1 ? "connected" : "disconnected";

    const payload = {
      status: dbStatus === "connected" ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      database: { status: dbStatus },
    };

    res.status(dbStatus === "connected" ? 200 : 503);
    return payload;
  }

  @Get("detailed")
  @UseGuards(JwtAuthGuard)
  detailed(@Res({ passthrough: true }) res: Response) {
    const memUsage = process.memoryUsage();
    const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(memUsage.heapTotal / 1024 / 1024);
    const percentage = heapTotalMb > 0 ? Math.round((heapUsedMb / heapTotalMb) * 100) : 0;

    res.status(200);
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      performance: {
        memory: {
          usedMb: heapUsedMb,
          totalMb: heapTotalMb,
          percentage,
        },
        uptime: Math.round(process.uptime()),
      },
      database: {
        status: this.connection.readyState === 1 ? "connected" : "disconnected",
      },
    };
  }
}
