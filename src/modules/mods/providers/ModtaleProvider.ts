import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { ILogger } from "../../../types";
import type { ModInfo, VersionInfo } from "../../../types/ModProvider";
import { ModProvider } from "../base/ModProvider";

const MODTALE_API_BASE = "https://api.modtale.net";
const MODS_DIR = "/server/mods";

interface ModtaleVersion {
  version: string;
  fileName: string;
  fileSize: number;
  releaseDate: string;
}

interface ModtaleProject {
  id: string;
  name: string;
  slug: string;
  summary?: string;
  downloads?: number;
  versions: ModtaleVersion[];
}

/**
 * Modtale mod provider implementation
 */
export class ModtaleProvider extends ModProvider {
  constructor(logger: ILogger, apiKey: string) {
    super(logger, "modtale", apiKey);
  }

  /**
   * Validate the API key by making a lightweight API call
   */
  async validateApiKey(): Promise<boolean> {
    try {
      // Make a lightweight call to verify the API key
      // Try to fetch a test endpoint or any simple endpoint
      const response = await fetch(`${MODTALE_API_BASE}/api/v1/projects`, {
        headers: {
          "X-MODTALE-KEY": this.apiKey,
          Accept: "application/json",
        },
      });

      if (response.status === 403 || response.status === 401) {
        this.logger.error("Modtale API key is invalid or malformed.");
        this.logger.warn(
          "Verify your MT_API_KEY is correct. If it contains '$' followed by letters (e.g., $abc), escape as '$$abc' in docker-compose.yml"
        );
        return false;
      }

      return response.ok;
    } catch (error) {
      this.logger.error(`Failed to validate Modtale API key: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Fetch mod information from Modtale API
   */
  protected async fetchModInfo(id: string): Promise<ModInfo | null> {
    const response = await fetch(`${MODTALE_API_BASE}/api/v1/projects/${id}`, {
      headers: {
        "X-MODTALE-KEY": this.apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      if (response.status === 403 || response.status === 401) {
        this.logger.warn(
          "Modtale API returned 403/401. Verify your API key is correct."
        );
      }
      throw new Error(`Modtale API error: ${response.status}`);
    }

    const project = (await response.json()) as ModtaleProject;

    // Convert to unified ModInfo format
    return {
      provider: "modtale",
      id: project.id,
      name: project.name,
      slug: project.slug,
      summary: project.summary,
      downloadCount: project.downloads,
      latestVersions: project.versions
        .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime())
        .map((version) => this.mapModtaleVersion(version, project.id)),
    };
  }

  /**
   * Fetch specific version information from Modtale API
   * Note: Modtale doesn't have a separate version endpoint,
   * so we fetch the project and extract the version
   */
  protected async fetchVersionInfo(id: string, version: string): Promise<VersionInfo> {
    const modInfo = await this.fetchModInfo(id);
    if (!modInfo) {
      throw new Error(`Project not found: ${id}`);
    }

    const versionInfo = modInfo.latestVersions.find((v) => v.id === version);
    if (!versionInfo) {
      throw new Error(`Version ${version} not found for project ${id}`);
    }

    return versionInfo;
  }

  /**
   * Download a mod file from Modtale
   */
  protected async downloadFile(file: VersionInfo, modName: string): Promise<void> {
    if (!file.downloadUrl) {
      throw new Error(`No download URL available for ${file.fileName}`);
    }

    this.logger.info(`  ↓ ${modName} (${file.fileName})`);

    const response = await fetch(file.downloadUrl, {
      headers: {
        "X-MODTALE-KEY": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const filePath = join(MODS_DIR, file.fileName);
    await writeFile(filePath, Buffer.from(arrayBuffer));
  }

  /**
   * Convert Modtale version format to unified VersionInfo format
   */
  private mapModtaleVersion(version: ModtaleVersion, projectId: string): VersionInfo {
    return {
      id: version.version,
      displayName: version.version,
      fileName: version.fileName,
      downloadUrl: `${MODTALE_API_BASE}/api/v1/projects/${projectId}/versions/${version.version}/download`,
      releaseDate: version.releaseDate,
      fileSize: version.fileSize,
    };
  }
}
