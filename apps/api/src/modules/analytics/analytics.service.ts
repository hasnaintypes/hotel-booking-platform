import { Injectable } from "@nestjs/common";
import {
  AnalyticsRepository,
  toRollupResponse,
} from "../../database/repositories/analytics.repository";

@Injectable()
export class AnalyticsService {
  constructor(private readonly analytics: AnalyticsRepository) {}

  async findRollups(limit?: string) {
    const parsed = Number.parseInt(String(limit || "20"), 10);
    const snapshots = await this.analytics.listSnapshots(parsed);
    return snapshots.map(toRollupResponse);
  }

  async createRollup() {
    const payload = await this.analytics.buildSnapshot();
    const snapshot = await this.analytics.createSnapshot(payload);
    return toRollupResponse(snapshot);
  }
}
