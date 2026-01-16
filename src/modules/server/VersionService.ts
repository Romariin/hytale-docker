import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ILogger, Paths, VersionInfo } from "../../types";

/**
 * Version tracking - load and save version info
 */
export class VersionService {
  constructor(
    private readonly logger: ILogger,
    private readonly paths: Paths,
  ) {}

  async load(): Promise<VersionInfo | null> {
    if (!existsSync(this.paths.VERSION_INFO_FILE)) return null;
    try {
      const raw = await readFile(this.paths.VERSION_INFO_FILE, "utf-8");
      return this.parse(raw);
    } catch {
      return null;
    }
  }

  async save(patchline: string, version: string): Promise<void> {
    const content = [
      `CURRENT_VERSION="${version}"`,
      `CURRENT_PATCHLINE="${patchline}"`,
      `LAST_UPDATE="${new Date().toISOString().replace("T", " ").replace("Z", " UTC")}"`,
    ].join("\n");

    await mkdir(dirname(this.paths.VERSION_INFO_FILE), { recursive: true });
    await writeFile(this.paths.VERSION_INFO_FILE, content);
    this.logger.success(`Version: ${version} (${patchline})`);
  }

  private parse(raw: string): VersionInfo | null {
    const data: Record<string, string> = {};
    for (const line of raw.split("\n").filter(Boolean)) {
      const match = line.match(/^(\w+)="(.+)"$/);
      if (match) data[match[1]] = match[2];
    }
    if (!data.CURRENT_VERSION || !data.CURRENT_PATCHLINE) return null;
    return {
      currentVersion: data.CURRENT_VERSION,
      currentPatchline: data.CURRENT_PATCHLINE,
      lastUpdate: data.LAST_UPDATE ?? "",
    };
  }
}
