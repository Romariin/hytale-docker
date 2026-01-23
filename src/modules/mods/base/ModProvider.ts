import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { ILogger } from "../../../types";
import type { ModEntry, ModInfo, VersionInfo, InstalledMod, ModsManifest, ProviderType } from "../../../types/ModProvider";

const MODS_DIR = "/server/mods";

/**
 * Abstract base class for mod providers (CurseForge, Modtale, etc.)
 * Handles common logic: manifest management, sync orchestration, cleanup
 */
export abstract class ModProvider {
  protected readonly manifestPath: string;
  protected readonly apiKey: string;
  protected readonly providerType: ProviderType;

  constructor(
    protected readonly logger: ILogger,
    providerType: ProviderType,
    apiKey: string,
  ) {
    this.providerType = providerType;
    this.apiKey = apiKey;
    this.manifestPath = join(MODS_DIR, `.${providerType}-manifest.json`);
  }

  /**
   * Validate the API key (provider-specific)
   * @returns true if valid, false if invalid
   */
  abstract validateApiKey(): Promise<boolean>;

  /**
   * Fetch mod information from the provider API
   */
  protected abstract fetchModInfo(id: string): Promise<ModInfo | null>;

  /**
   * Fetch specific version information from the provider API
   */
  protected abstract fetchVersionInfo(id: string, version: string): Promise<VersionInfo>;

  /**
   * Download a mod file to /server/mods/
   */
  protected abstract downloadFile(file: VersionInfo, modName: string): Promise<void>;

  /**
   * Main entry point - sync all mods from configuration
   */
  async syncMods(modEntries: ModEntry[]): Promise<void> {
    if (modEntries.length === 0) {
      return;
    }

    this.logger.step(`Syncing ${modEntries.length} ${this.providerType} mod(s)`);

    // Validate API key before proceeding
    const isValidKey = await this.validateApiKey();
    if (!isValidKey) {
      this.logger.error(`Skipping ${this.providerType} mod sync due to invalid API key`);
      return;
    }

    await mkdir(MODS_DIR, { recursive: true });

    const manifest = await this.loadManifest();
    const newMods: InstalledMod[] = [];

    for (const entry of modEntries) {
      try {
        const installed = await this.syncMod(entry, manifest);
        if (installed) {
          newMods.push(installed);
        }
      } catch (error) {
        this.logger.error(`Failed to sync mod ${entry.projectId}: ${(error as Error).message}`);
      }
    }

    // Remove mods that are no longer in config
    await this.cleanupOldMods(modEntries, manifest);

    // Update manifest with new mods
    const updatedManifest: ModsManifest = {
      provider: this.providerType,
      lastSync: new Date().toISOString(),
      mods: newMods,
    };
    await this.saveManifest(updatedManifest);

    this.logger.success(`${this.providerType} mods synced (${newMods.length} mods)`);
  }

  /**
   * Sync a single mod entry
   */
  private async syncMod(entry: ModEntry, manifest: ModsManifest): Promise<InstalledMod | null> {
    const modInfo = await this.fetchModInfo(entry.projectId);
    if (!modInfo) {
      throw new Error(`Mod not found: ${entry.projectId}`);
    }

    let targetFile: VersionInfo;

    if (entry.version) {
      // Specific version requested
      targetFile = await this.fetchVersionInfo(entry.projectId, entry.version);
    } else {
      // Get latest version
      if (modInfo.latestVersions.length === 0) {
        throw new Error(`No files available for mod: ${modInfo.name}`);
      }
      // First version is assumed to be the latest
      targetFile = modInfo.latestVersions[0];
    }

    // Check if already installed
    const existing = manifest.mods.find((m) => m.projectId === entry.projectId);
    if (existing && existing.version === targetFile.id) {
      const filePath = join(MODS_DIR, existing.fileName);
      if (existsSync(filePath)) {
        this.logger.info(`  ✓ ${modInfo.name} (up to date)`);
        return existing;
      }
    }

    // Remove old version if exists
    if (existing) {
      const oldPath = join(MODS_DIR, existing.fileName);
      if (existsSync(oldPath)) {
        await unlink(oldPath);
      }
    }

    // Download new version
    await this.downloadFile(targetFile, modInfo.name);

    return {
      provider: this.providerType,
      projectId: entry.projectId,
      version: targetFile.id,
      fileName: targetFile.fileName,
      installedAt: new Date().toISOString(),
    };
  }

  /**
   * Remove mods that are no longer in the configuration
   */
  private async cleanupOldMods(currentEntries: ModEntry[], manifest: ModsManifest): Promise<void> {
    const currentProjectIds = new Set(currentEntries.map((e) => e.projectId));

    for (const installed of manifest.mods) {
      if (!currentProjectIds.has(installed.projectId)) {
        const filePath = join(MODS_DIR, installed.fileName);
        if (existsSync(filePath)) {
          this.logger.info(`  ✗ Removing ${installed.fileName}`);
          await unlink(filePath);
        }
      }
    }
  }

  /**
   * Load manifest from disk
   */
  protected async loadManifest(): Promise<ModsManifest> {
    if (!existsSync(this.manifestPath)) {
      return {
        provider: this.providerType,
        lastSync: new Date().toISOString(),
        mods: [],
      };
    }

    try {
      const content = await readFile(this.manifestPath, "utf-8");
      return JSON.parse(content) as ModsManifest;
    } catch {
      return {
        provider: this.providerType,
        lastSync: new Date().toISOString(),
        mods: [],
      };
    }
  }

  /**
   * Save manifest to disk
   */
  protected async saveManifest(manifest: ModsManifest): Promise<void> {
    await writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
  }
}
