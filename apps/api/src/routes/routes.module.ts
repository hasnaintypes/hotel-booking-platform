import { Module } from "@nestjs/common";
import { RouterModule } from "@nestjs/core";
import { AdminRoutesModule } from "./admin.routes.module";
import { ManageRoutesModule } from "./manage.routes.module";
import { PartnerRoutesModule } from "./partner.routes.module";
import { PublicRoutesModule } from "./public.routes.module";

@Module({
  imports: [
    RouterModule.register([
      { path: "manage", module: ManageRoutesModule },
      { path: "admin", module: AdminRoutesModule },
      { path: "partner", module: PartnerRoutesModule },
    ]),
    PublicRoutesModule,
    ManageRoutesModule,
    AdminRoutesModule,
    PartnerRoutesModule,
  ],
})
export class RoutesModule {}
