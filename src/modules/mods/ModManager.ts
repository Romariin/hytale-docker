import type { ILogger } from "../../types";
import type { ModEntry, ProviderType } from "../../types/ModProvider";
import { ModProvider } from "./base/ModProvider";
import { CurseForgeProvider } from "./providers/CurseForgeProvider";
import { ModtaleProvider } from "./providers/ModtaleProvider";

/**
 * Multi-provider mod manager
 * Orchestrates mod syncing across CurseForge, Modtale, and future providers
 */
export class ModManager {
  private readonly providers = new Map<ProviderType, ModProvider>();

  constructor(private readonly logger: ILogger) {}

  /**
   * Register a mod provider with its API key
   */
  registerProvider(type: ProviderType, apiKey: string): void {
    let provider: ModProvider;

    switch (type) {
      case "curseforge":
        provider = new CurseForgeProvider(this.logger, apiKey);
        break;
      case "modtale":
        provider = new ModtaleProvider(this.logger, apiKey);
        break;
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }

    this.providers.set(type, provider);
  }

  /**
   * Sync all mods from the given entries
   * Automatically groups entries by provider and syncs each provider
   */
  async syncAllMods(entries: ModEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    // Group entries by provider
    const groupedEntries = new Map<ProviderType, ModEntry[]>();
    for (const entry of entries) {
      const providerEntries = groupedEntries.get(entry.provider) || [];
      providerEntries.push(entry);
      groupedEntries.set(entry.provider, providerEntries);
    }

    // Sync each provider
    for (const [providerType, providerEntries] of groupedEntries) {
      const provider = this.providers.get(providerType);
      if (!provider) {
        this.logger.error(
          `Provider ${providerType} not registered. Skipping ${providerEntries.length} mods.`
        );
        continue;
      }

      await provider.syncMods(providerEntries);
    }
  }
}
