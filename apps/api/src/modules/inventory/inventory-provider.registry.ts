import { ConflictException, Injectable } from "@nestjs/common";
import type { InventoryProvider } from "../../domain/inventory/inventory-provider";
import type { InventorySource } from "../../domain/inventory/offer";
import { ManagedInventoryProvider } from "./providers/managed-inventory.provider";

/**
 * Resolves the provider for a source. Only managed inventory exists in production until M4 adds
 * supplier adapters; tests may register a mock supplier to prove that booking code is source
 * agnostic.
 */
@Injectable()
export class InventoryProviderRegistry {
  private readonly providers = new Map<InventorySource, InventoryProvider>();

  constructor(managed: ManagedInventoryProvider) {
    this.register(managed);
  }

  register(provider: InventoryProvider): void {
    this.providers.set(provider.source, provider);
  }

  get(source: InventorySource): InventoryProvider {
    const provider = this.providers.get(source);
    if (!provider) {
      throw new ConflictException(`Inventory source "${source}" is not configured`);
    }
    return provider;
  }
}
