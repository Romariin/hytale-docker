import { existsSync } from "node:fs";
import { mkdir, chmod, unlink, rename, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { ILogger, Paths, VersionInfo, UpdateCheckResult } from "../../types";
import type { Config } from "../core/Config";
import type { VersionService } from "./VersionService";

const DOWNLOADER_URL = "https://downloader.hytale.com/hytale-downloader.zip";

/**
 * Update manager for server and downloader auto-updates
 */
export class UpdateManager {
  constructor(
    private readonly logger: ILogger,
    private readonly config: Config,
    private readonly paths: Paths,
    private readonly versionService: VersionService,
  ) {}

  /**
   * Show header with version info and check for updates
   * Returns true if server needs to be re-downloaded
   */
  async showHeaderAndCheckUpdates(): Promise<boolean> {
    const [downloaderResult, serverResult] = await Promise.all([
      this.checkDownloaderUpdate(),
      this.checkServerUpdate(),
    ]);

    // Build version lines for header
    const downloaderLine = this.formatVersionLine("Downloader", downloaderResult);
    const serverLine = this.formatVersionLine("Server", serverResult);

    const hasUpdates = downloaderResult.updateAvailable || serverResult.updateAvailable;
    const autoUpdateLine = hasUpdates
      ? this.config.autoUpdate
        ? "🔄 Auto-update enabled, updating..."
        : "💡 Set AUTO_UPDATE=true to enable automatic updates"
      : null;

    // Print custom header
    this.printHeader(downloaderLine, serverLine, autoUpdateLine);

    let serverNeedsUpdate = serverResult.updateAvailable;

    // Handle auto-update
    if (hasUpdates && this.config.autoUpdate) {
      if (downloaderResult.updateAvailable) {
        await this.updateDownloader();
        serverNeedsUpdate = true;
      }
    }

    return serverNeedsUpdate;
  }

  private formatVersionLine(component: string, result: UpdateCheckResult): string {
    const versionPart = result.currentVersion ?? "not installed";
    
    if (result.updateAvailable && result.latestVersion) {
      return `⚠️  ${component}: ${versionPart} → ${result.latestVersion}`;
    }
    return `✅ ${component}: ${versionPart}`;
  }

  private printHeader(downloaderLine: string, serverLine: string, autoUpdateLine: string | null): void {
    const RESET = "\x1b[0m";
    const BOLD = "\x1b[1m";
    const DIM = "\x1b[2m";
    const CYAN = "\x1b[36m";

    const line = "═".repeat(59);
    console.log("");
    console.log(`${BOLD}${CYAN}${line}${RESET}`);
    console.log(`${BOLD}  Hytale-Docker${RESET}`);
    console.log(`  ${DIM}Docs: https://hytale.romarin.dev/docs/quick-start${RESET}`);
    console.log(`${BOLD}${CYAN}${line}${RESET}`);
    console.log(`${BOLD}  Version${RESET}`);
    console.log(`  ${downloaderLine}`);
    console.log(`  ${serverLine}`);
    if (autoUpdateLine) {
      console.log(`  ${autoUpdateLine}`);
    }
    console.log(`${BOLD}${CYAN}${line}${RESET}`);
    console.log("");
  }

  private async checkDownloaderUpdate(): Promise<UpdateCheckResult> {
    const currentVersion = await this.getDownloaderVersion();
    const latestVersion = await this.fetchLatestDownloaderVersion();

    if (!currentVersion) {
      return {
        currentVersion: null,
        latestVersion,
        updateAvailable: true,
      };
    }

    if (!latestVersion) {
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
      };
    }

    const updateAvailable = this.compareVersions(currentVersion, latestVersion) < 0;

    return {
      currentVersion,
      latestVersion,
      updateAvailable,
    };
  }

  private async checkServerUpdate(): Promise<UpdateCheckResult> {
    const current = await this.versionService.load();
    const latestVersion = await this.fetchLatestServerVersion();

    if (!current) {
      return {
        currentVersion: null,
        latestVersion,
        updateAvailable: true,
      };
    }

    if (!latestVersion) {
      return {
        currentVersion: current.currentVersion,
        latestVersion: null,
        updateAvailable: false,
      };
    }

    // Also check if patchline changed
    const patchlineChanged = current.currentPatchline !== this.config.patchline;
    const versionChanged = current.currentVersion !== latestVersion;

    return {
      currentVersion: current.currentVersion,
      latestVersion,
      updateAvailable: patchlineChanged || versionChanged,
    };
  }

  private async getDownloaderVersion(): Promise<string | null> {
    if (!existsSync(this.paths.HYTALE_DOWNLOADER)) {
      return null;
    }

    try {
      const proc = Bun.spawn([this.paths.HYTALE_DOWNLOADER, "-version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      await proc.exited;
      return output.split("\n")[0]?.trim() || null;
    } catch {
      return null;
    }
  }

  private async fetchLatestDownloaderVersion(): Promise<string | null> {
    try {
      // Download the zip to a temp location and extract version info
      const tempDir = "/tmp/downloader-check";
      await mkdir(tempDir, { recursive: true });

      const response = await fetch(DOWNLOADER_URL);
      if (!response.ok) return null;

      const zipPath = join(tempDir, "hytale-downloader.zip");
      const arrayBuffer = await response.arrayBuffer();
      await writeFile(zipPath, Buffer.from(arrayBuffer));

      // Extract to check version
      const proc = Bun.spawn(["unzip", "-oq", zipPath, "-d", tempDir]);
      await proc.exited;

      // Find the binary and get its version
      const arch = process.arch === "arm64" ? "arm64" : "amd64";
      const binaryPath = join(tempDir, `hytale-downloader-linux-${arch}`);

      if (existsSync(binaryPath)) {
        await chmod(binaryPath, 0o755);
        const versionProc = Bun.spawn([binaryPath, "-version"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const versionOutput = await new Response(versionProc.stdout).text();
        await versionProc.exited;

        // Cleanup
        await Bun.spawn(["rm", "-rf", tempDir]).exited;

        return versionOutput.split("\n")[0]?.trim() || null;
      }

      return null;
    } catch {
      return null;
    }
  }

  private async fetchLatestServerVersion(): Promise<string | null> {
    if (!existsSync(this.paths.HYTALE_DOWNLOADER)) return null;
    if (!existsSync(this.paths.DOWNLOADER_CREDENTIALS_FILE)) return null;

    try {
      const proc = Bun.spawn(
        [
          this.paths.HYTALE_DOWNLOADER,
          "-print-version",
          "-patchline",
          this.config.patchline,
          "-credentials-path",
          this.paths.DOWNLOADER_CREDENTIALS_FILE,
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      const timeout = setTimeout(() => proc.kill(), 10000);
      const output = await new Response(proc.stdout).text();
      clearTimeout(timeout);

      const match = output.match(/version\s+([^\)\s]+)/i);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }

  private async updateDownloader(): Promise<void> {
    this.logger.step("Updating hytale-downloader");

    try {
      const tempDir = "/tmp/downloader-update";
      await mkdir(tempDir, { recursive: true });

      // Download the zip
      const response = await fetch(DOWNLOADER_URL);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`);
      }

      const zipPath = join(tempDir, "hytale-downloader.zip");
      const arrayBuffer = await response.arrayBuffer();
      await writeFile(zipPath, Buffer.from(arrayBuffer));

      // Extract
      const extractProc = Bun.spawn(["unzip", "-oq", zipPath, "-d", tempDir]);
      if ((await extractProc.exited) !== 0) {
        throw new Error("Failed to extract downloader");
      }

      // Find the correct binary for this architecture
      const arch = process.arch === "arm64" ? "arm64" : "amd64";
      const binaryPath = join(tempDir, `hytale-downloader-linux-${arch}`);

      if (!existsSync(binaryPath)) {
        throw new Error(`Binary not found for architecture: ${arch}`);
      }

      // Replace the existing binary
      await chmod(binaryPath, 0o755);
      
      // Backup old version
      const backupPath = `${this.paths.HYTALE_DOWNLOADER}.bak`;
      if (existsSync(this.paths.HYTALE_DOWNLOADER)) {
        await rename(this.paths.HYTALE_DOWNLOADER, backupPath);
      }

      // Copy new version
      const copyProc = Bun.spawn(["cp", binaryPath, this.paths.HYTALE_DOWNLOADER]);
      if ((await copyProc.exited) !== 0) {
        // Restore backup on failure
        if (existsSync(backupPath)) {
          await rename(backupPath, this.paths.HYTALE_DOWNLOADER);
        }
        throw new Error("Failed to copy new downloader");
      }

      await chmod(this.paths.HYTALE_DOWNLOADER, 0o755);

      // Remove backup
      if (existsSync(backupPath)) {
        await unlink(backupPath);
      }

      // Cleanup temp
      await Bun.spawn(["rm", "-rf", tempDir]).exited;

      // Get and log new version
      const newVersion = await this.getDownloaderVersion();
      this.logger.success(`Downloader updated to ${newVersion}`);
    } catch (error) {
      this.logger.error(`Failed to update downloader: ${(error as Error).message}`);
    }
  }

  /**
   * Compare two version strings
   * Returns: -1 if a < b, 0 if a == b, 1 if a > b
   */
  private compareVersions(a: string, b: string): number {
    // Handle versions like "v1.2.3" or "1.2.3"
    const cleanA = a.replace(/^v/, "");
    const cleanB = b.replace(/^v/, "");

    const partsA = cleanA.split(/[.-]/).map((p) => {
      const num = Number.parseInt(p, 10);
      return Number.isNaN(num) ? p : num;
    });
    const partsB = cleanB.split(/[.-]/).map((p) => {
      const num = Number.parseInt(p, 10);
      return Number.isNaN(num) ? p : num;
    });

    const maxLen = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < maxLen; i++) {
      const partA = partsA[i] ?? 0;
      const partB = partsB[i] ?? 0;

      if (typeof partA === "number" && typeof partB === "number") {
        if (partA < partB) return -1;
        if (partA > partB) return 1;
      } else {
        const strA = String(partA);
        const strB = String(partB);
        if (strA < strB) return -1;
        if (strA > strB) return 1;
      }
    }

    return 0;
  }
}
