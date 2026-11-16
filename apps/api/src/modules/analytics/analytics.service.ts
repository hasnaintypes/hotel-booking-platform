import { Injectable } from "@nestjs/common";
import type { CursorPage } from "@hotel-booking/contracts";
import { pageOf, pageSize } from "../../common/pagination/cursor-page";
import { readTimestampCursor } from "../../common/pagination/sorted-cursor";
import {
  AnalyticsRepository,
  toRollupResponse,
  type RollupResponse,
} from "../../database/repositories/analytics.repository";
import type { RollupListQueryDto } from "./dto/list-rollups-query.dto";

const ROLLUP_LIST_SCOPE = "analytics:rollups";

@Injectable()
export class AnalyticsService {
  constructor(private readonly analytics: AnalyticsRepository) {}

  async findRollups(query: RollupListQueryDto): Promise<CursorPage<RollupResponse>> {
    const limit = pageSize(query);
    const snapshots = await this.analytics.listSnapshotsPage({
      limit,
      cursor: readTimestampCursor(query.cursor, ROLLUP_LIST_SCOPE),
    });
    const page = pageOf(snapshots, limit, ROLLUP_LIST_SCOPE, (row) => ({
      key: row.cursorKey,
      id: row.id,
    }));
    return { data: page.data.map(toRollupResponse), pageInfo: page.pageInfo };
  }

  async createRollup() {
    const payload = await this.analytics.buildSnapshot();
    const snapshot = await this.analytics.createSnapshot(payload);
    return toRollupResponse(snapshot);
  }
}
