import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { ILogger } from "../../../types";
import type { ModInfo, VersionInfo } from "../../../types/ModProvider";
import { ModProvider } from "../base/ModProvider";

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
  summary?: string;
  downloadCount?: number;
  latestFiles: CurseForgeFile[];
}

/**
 * CurseForge mod provider implementation
 */
export class CurseForgeProvider extends ModProvider {
  constructor(logger: ILogger, apiKey: string) {
    super(logger, "curseforge", apiKey);
  }

  /**
   * Validate the API key by making a lightweight API call
   */
  async validateApiKey(): Promise<boolean> {
    try {
      // Use the games endpoint as a lightweight validation call
      const response = await fetch(`${CURSEFORGE_API_BASE}/games`, {
        headers: {
          "x-api-key": this.apiKey,
          Accept: "application/json",
        },
      });

      if (response.status === 403) {
        this.logger.error("CurseForge API key is invalid or malformed.");
        this.logger.warn(
          "Verify your CF_API_KEY is correct. If it contains '$' followed by letters (e.g., $abc), escape as '$$abc' in docker-compose.yml"
        );
        return false;
      }

      return response.ok;
    } catch (error) {
      this.logger.error(`Failed to validate CurseForge API key: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Fetch mod information from CurseForge API
   */
  protected async fetchModInfo(id: string): Promise<ModInfo | null> {
    const projectId = Number.parseInt(id, 10);
    if (Number.isNaN(projectId)) {
      throw new Error(`Invalid CurseForge project ID: ${id}`);
    }

    const response = await fetch(`${CURSEFORGE_API_BASE}/mods/${projectId}`, {
      headers: {
        "x-api-key": this.apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      if (response.status === 403) {
        this.logger.warn(
          "CurseForge API returned 403 Forbidden. Verify your API key is correct."
        );
      }
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const data = (await response.json()) as { data: CurseForgeModInfo };
    const cfMod = data.data;

    // Convert to unified ModInfo format
    return {
      provider: "curseforge",
      id: cfMod.id.toString(),
      name: cfMod.name,
      slug: cfMod.slug,
      summary: cfMod.summary,
      downloadCount: cfMod.downloadCount,
      latestVersions: cfMod.latestFiles
        .sort((a, b) => new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime())
        .map((file) => this.mapCurseForgeFile(file)),
    };
  }

  /**
   * Fetch specific file information from CurseForge API
   */
  protected async fetchVersionInfo(id: string, version: string): Promise<VersionInfo> {
    const projectId = Number.parseInt(id, 10);
    const fileId = Number.parseInt(version, 10);

    if (Number.isNaN(projectId) || Number.isNaN(fileId)) {
      throw new Error(`Invalid CurseForge IDs: project=${id}, file=${version}`);
    }

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
    return this.mapCurseForgeFile(data.data);
  }

  /**
   * Download a mod file from CurseForge
   */
  protected async downloadFile(file: VersionInfo, modName: string): Promise<void> {
    let downloadUrl = file.downloadUrl;

    // Some mods don't provide direct download URL, need to construct it
    if (!downloadUrl) {
      const fileId = Number.parseInt(file.id, 10);
      // CurseForge CDN URL pattern
      const idPart1 = Math.floor(fileId / 1000);
      const idPart2 = fileId % 1000;
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

  /**
   * Convert CurseForge file format to unified VersionInfo format
   */
  private mapCurseForgeFile(file: CurseForgeFile): VersionInfo {
    return {
      id: file.id.toString(),
      displayName: file.displayName,
      fileName: file.fileName,
      downloadUrl: file.downloadUrl,
      releaseDate: file.fileDate,
      fileSize: file.fileLength,
    };
  }
}
