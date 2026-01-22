import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join, basename } from "node:path";
import type { ILogger } from "../../types";

const CURSEFORGE_API_BASE = "https://api.curseforge.com/v1";
const MODS_DIR = "/server/mods";

interface CurseForgeFile {
  id: number;
  displayName: string;
  fileName: string;
  downloadUrl: string | null;
  fileDate: string;
  fileLength: number;
}

interface CurseForgeModInfo {
  id: number;
  name: string;
  slug: string;
  latestFiles: CurseForgeFile[];
}

interface ModEntry {
  projectId: number;
  fileId: number | null; // null = latest
}

interface InstalledMod {
  projectId: number;
  fileId: number;
  fileName: string;
  installedAt: string;
}

interface ModsManifest {
  mods: InstalledMod[];
}

/**
 * CurseForge mod downloader and manager
 */
export class CurseForgeManager {
  private readonly manifestPath = join(MODS_DIR, ".curseforge-manifest.json");
  private readonly apiKey: string;

  constructor(
    private readonly logger: ILogger,
    apiKey: string,
  ) {
    // Unescape $ characters that were escaped to avoid shell variable expansion
    this.apiKey = apiKey.replace(/\\\$/g, "$");
  }

  /**
   * Parse CF_MODS environment variable
   * Format: "projectId,projectId:fileId,projectId"
   */
  static parseModsConfig(modsConfig: string): ModEntry[] {
    if (!modsConfig.trim()) return [];

    return modsConfig.split(",").map((entry) => {
      const trimmed = entry.trim();
      const [projectIdStr, fileIdStr] = trimmed.split(":");

      const projectId = Number.parseInt(projectIdStr, 10);
      if (Number.isNaN(projectId)) {
        throw new Error(`Invalid project ID: ${projectIdStr}`);
      }

      let fileId: number | null = null;
      if (fileIdStr) {
        fileId = Number.parseInt(fileIdStr, 10);
        if (Number.isNaN(fileId)) {
          throw new Error(`Invalid file ID: ${fileIdStr}`);
        }
      }

      return { projectId, fileId };
    });
  }

  /**
   * Sync mods from CurseForge based on configuration
   */
  async syncMods(modEntries: ModEntry[]): Promise<void> {
    if (modEntries.length === 0) {
      return;
    }

    this.logger.step(`Syncing ${modEntries.length} CurseForge mod(s)`);

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
      mods: newMods,
    };
    await this.saveManifest(updatedManifest);

    this.logger.success(`CurseForge mods synced (${newMods.length} mods)`);
  }

  private async syncMod(entry: ModEntry, manifest: ModsManifest): Promise<InstalledMod | null> {
    const modInfo = await this.fetchModInfo(entry.projectId);
    if (!modInfo) {
      throw new Error(`Mod not found: ${entry.projectId}`);
    }

    let targetFile: CurseForgeFile;

    if (entry.fileId) {
      // Specific file requested
      targetFile = await this.fetchFileInfo(entry.projectId, entry.fileId);
    } else {
      // Get latest file
      if (modInfo.latestFiles.length === 0) {
        throw new Error(`No files available for mod: ${modInfo.name}`);
      }
      // Sort by date to get the most recent
      const sorted = [...modInfo.latestFiles].sort(
        (a, b) => new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime(),
      );
      targetFile = sorted[0];
    }

    // Check if already installed
    const existing = manifest.mods.find((m) => m.projectId === entry.projectId);
    if (existing && existing.fileId === targetFile.id) {
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
      projectId: entry.projectId,
      fileId: targetFile.id,
      fileName: targetFile.fileName,
      installedAt: new Date().toISOString(),
    };
  }

  private async fetchModInfo(projectId: number): Promise<CurseForgeModInfo | null> {
    const response = await fetch(`${CURSEFORGE_API_BASE}/mods/${projectId}`, {
      headers: {
        "x-api-key": this.apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const data = (await response.json()) as { data: CurseForgeModInfo };
    return data.data;
  }

  private async fetchFileInfo(projectId: number, fileId: number): Promise<CurseForgeFile> {
    const response = await fetch(`${CURSEFORGE_API_BASE}/mods/${projectId}/files/${fileId}`, {
      headers: {
        "x-api-key": this.apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch file info: ${response.status}`);
    }

    const data = (await response.json()) as { data: CurseForgeFile };
    return data.data;
  }

  private async downloadFile(file: CurseForgeFile, modName: string): Promise<void> {
    let downloadUrl = file.downloadUrl;

    // Some mods don't provide direct download URL, need to construct it
    if (!downloadUrl) {
      // CurseForge CDN URL pattern
      const idPart1 = Math.floor(file.id / 1000);
      const idPart2 = file.id % 1000;
      downloadUrl = `https://edge.forgecdn.net/files/${idPart1}/${idPart2}/${file.fileName}`;
    }

    this.logger.info(`  ↓ ${modName} (${file.fileName})`);

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const filePath = join(MODS_DIR, file.fileName);
    await writeFile(filePath, Buffer.from(arrayBuffer));
  }

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

  private async loadManifest(): Promise<ModsManifest> {
    if (!existsSync(this.manifestPath)) {
      return { mods: [] };
    }

    try {
      const content = await readFile(this.manifestPath, "utf-8");
      return JSON.parse(content) as ModsManifest;
    } catch {
      return { mods: [] };
    }
  }

  private async saveManifest(manifest: ModsManifest): Promise<void> {
    await writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Force update a single mod to its latest version
   */
  async updateMod(projectId: number): Promise<void> {
    this.logger.step(`Updating mod ${projectId} to latest version`);

    await mkdir(MODS_DIR, { recursive: true });

    const manifest = await this.loadManifest();
    const existing = manifest.mods.find((m) => m.projectId === projectId);

    // Fetch mod info
    const modInfo = await this.fetchModInfo(projectId);
    if (!modInfo) {
      throw new Error(`Mod not found: ${projectId}`);
    }

    if (modInfo.latestFiles.length === 0) {
      throw new Error(`No files available for mod: ${modInfo.name}`);
    }

    // Get latest file
    const sorted = [...modInfo.latestFiles].sort(
      (a, b) => new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime(),
    );
    const latestFile = sorted[0];

    // Remove old version if exists
    if (existing) {
      const oldPath = join(MODS_DIR, existing.fileName);
      if (existsSync(oldPath)) {
        await unlink(oldPath);
      }
    }

    // Download new version
    await this.downloadFile(latestFile, modInfo.name);

    // Update manifest
    const updatedMod: InstalledMod = {
      projectId,
      fileId: latestFile.id,
      fileName: latestFile.fileName,
      installedAt: new Date().toISOString(),
    };

    const newMods = manifest.mods.filter((m) => m.projectId !== projectId);
    newMods.push(updatedMod);
    await this.saveManifest({ mods: newMods });

    this.logger.success(`Updated ${modInfo.name} to ${latestFile.fileName}`);
  }
}
