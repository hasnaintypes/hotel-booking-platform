import { Module } from "@nestjs/common";
import { InventoryProviderRegistry } from "./inventory-provider.registry";
import { OffersController } from "./offers.controller";
import { OffersService } from "./offers.service";
import { ManagedInventoryProvider } from "./providers/managed-inventory.provider";

/**
 * The unified inventory boundary. Booking and cancellation import `OffersService` only; supplier
 * adapters (M4) register here without changing those callers.
 */
@Module({
  controllers: [OffersController],
  providers: [ManagedInventoryProvider, InventoryProviderRegistry, OffersService],
  exports: [OffersService, InventoryProviderRegistry, ManagedInventoryProvider],
})
export class InventoryModule {}
