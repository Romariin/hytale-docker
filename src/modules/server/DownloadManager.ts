import { existsSync } from "node:fs";
import { mkdir, writeFile, chmod, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ILogger, Paths, OAuthTokens, DownloaderCredentials } from "../../types";
import type { Config } from "../core/Config";
import type { VersionService } from "./VersionService";

/**
 * Server download and extraction
 */
export class DownloadManager {
  constructor(
    private readonly logger: ILogger,
    private readonly config: Config,
    private readonly paths: Paths,
    private readonly versionService: VersionService,
  ) {}

  async writeCredentials(tokens: OAuthTokens): Promise<void> {
    const credentials: DownloaderCredentials = {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
    };
    await mkdir(dirname(this.paths.DOWNLOADER_CREDENTIALS_FILE), { recursive: true });
    await writeFile(this.paths.DOWNLOADER_CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
    await chmod(this.paths.DOWNLOADER_CREDENTIALS_FILE, 0o600);
  }

  /**
   * Download and extract the server files
   */
  async downloadServer(tokens: OAuthTokens): Promise<void> {
    const { patchline } = this.config;

    // Ensure credentials are written
    await this.writeCredentials(tokens);

    this.logger.step("Downloading server files");

    const downloadDir = join(this.paths.SERVER_DIR, ".cache");
    await mkdir(downloadDir, { recursive: true });

    const output = await this.runDownloader(patchline, downloadDir);
    const zipPath = await this.findZip(downloadDir);

    if (!zipPath) throw new Error("No zip file found after download");

    this.logger.step("Extracting server files");
    await this.extract(zipPath, this.paths.SERVER_DIR);
    await rm(downloadDir, { recursive: true, force: true });

    if (!existsSync(this.paths.SERVER_JAR)) throw new Error("Server JAR missing");
    if (!existsSync(this.paths.ASSETS_ZIP)) throw new Error("Assets.zip missing");

    const version = this.extractVersion(output, zipPath);
    await this.versionService.save(patchline, version);

    this.logger.success("Server files ready");
  }

  private async runDownloader(patchline: string, cwd: string): Promise<string[]> {
    const output: string[] = [];
    const errors: string[] = [];

    const proc = Bun.spawn(
      [this.paths.HYTALE_DOWNLOADER, "-patchline", patchline, "-credentials-path", this.paths.DOWNLOADER_CREDENTIALS_FILE],
      { cwd, stdout: "pipe", stderr: "pipe" },
    );

    // Read stdout
    const stdoutReader = proc.stdout.getReader();
    const stderrReader = proc.stderr.getReader();
    const decoder = new TextDecoder();

    // Read stderr in parallel
    const stderrPromise = (async () => {
      while (true) {
        const { done, value } = await stderrReader.read();
        if (done) break;
        errors.push(decoder.decode(value));
      }
    })();

    while (true) {
      const { done, value } = await stdoutReader.read();
      if (done) break;

      for (const line of decoder.decode(value).split("\n").filter(Boolean)) {
        output.push(line);

        if (line.includes("oauth.accounts.hytale.com/oauth2/device/verify")) {
          this.logger.header("AUTHENTICATION REQUIRED");
          console.log(`  ${line}\n`);
        } else if (line.includes("downloading latest")) {
          this.logger.step(`Downloading latest on ${patchline} patchline`);
        } else if (
          !line.includes("validating checksum") &&
          !line.includes("[") &&
          !line.includes("hytale.com") &&
          !line.includes("successfully downloaded")
        ) {
          console.log(line);
        }
      }
    }

    await stderrPromise;
    const exitCode = await proc.exited;
    
    if (exitCode !== 0) {
      const errorMsg = errors.join("\n").trim();
      if (errorMsg) {
        this.logger.error(`Downloader stderr: ${errorMsg}`);
      }
      throw new Error(`Download failed (exit code: ${exitCode})`);
    }

    return output;
  }

  private async findZip(dir: string): Promise<string | null> {
    const entries = await readdir(dir);
    const zip = entries.find((e) => e.endsWith(".zip"));
    return zip ? join(dir, zip) : null;
  }

  private async extract(zipPath: string, destDir: string): Promise<void> {
    const proc = Bun.spawn(["unzip", "-oq", zipPath, "-d", destDir]);
    if ((await proc.exited) !== 0) throw new Error("Extraction failed");
  }

  private extractVersion(output: string[], zipPath: string): string {
    for (const line of output) {
      if (line.includes("successfully downloaded")) {
        const match = line.match(/version\s+([^\)]+)/i);
        if (match?.[1]) return match[1].trim();
      }
    }
    const match = zipPath.split("/").pop()?.match(/\d{4}\.\d{2}\.\d{2}-[a-f0-9]+/);
    return match?.[0] ?? "unknown";
  }
}
