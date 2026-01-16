import type { ILogger, ProfilesResponse, SelectedProfile } from "../../types";
import type { TokenStore } from "./TokenStore";

/**
 * Game profile selection and caching
 */
export class ProfileManager {
  constructor(
    private readonly logger: ILogger,
    private readonly tokenStore: TokenStore,
    private readonly autoSelect: boolean,
  ) {}

  async select(profiles: ProfilesResponse): Promise<SelectedProfile | null> {
    // Check saved profile
    const saved = await this.tokenStore.loadSelectedProfile();
    if (saved && profiles.profiles.some((p) => p.uuid === saved.uuid)) {
      this.logger.info(`Using saved profile: ${saved.username} (${saved.uuid.slice(0, 8)}...)`);
      return saved;
    }

    // Single profile - auto-select
    if (profiles.profiles.length === 1) {
      const profile = profiles.profiles[0];
      const selected = this.build(profile.uuid, profile.username);
      await this.tokenStore.saveSelectedProfile(selected);
      this.logger.info(`Using profile: ${profile.username} (${profile.uuid.slice(0, 8)}...)`);
      return selected;
    }

    // Multiple profiles with auto-select
    if (this.autoSelect) {
      const profile = profiles.profiles[0];
      const selected = this.build(profile.uuid, profile.username);
      await this.tokenStore.saveSelectedProfile(selected);
      this.logger.info(`Auto-selected profile: ${profile.username} (${profile.uuid.slice(0, 8)}...)`);
      return selected;
    }

    // Manual selection required
    this.printPrompt(profiles);
    return null;
  }

  async setSelection(profiles: ProfilesResponse, selector: string): Promise<SelectedProfile> {
    const selected = this.resolve(profiles, selector);
    await this.tokenStore.saveSelectedProfile(selected);
    this.logger.success(`Selected profile: ${selected.username} (${selected.uuid.slice(0, 8)}...)`);
    return selected;
  }

  formatList(profiles: ProfilesResponse, selectedUuid?: string): string[] {
    return profiles.profiles.map((p, i) => {
      const marker = selectedUuid === p.uuid ? "► " : "  ";
      return `  ${marker}${i + 1}. ${p.username} (${p.uuid.slice(0, 8)}...)`;
    });
  }

  private resolve(profiles: ProfilesResponse, selector: string): SelectedProfile {
    if (/^\d+$/.test(selector)) {
      const index = Number.parseInt(selector, 10) - 1;
      if (index < 0 || index >= profiles.profiles.length) {
        throw new Error(`Invalid profile number. Valid range: 1-${profiles.profiles.length}`);
      }
      const p = profiles.profiles[index];
      return this.build(p.uuid, p.username);
    }

    const profile = profiles.profiles.find((p) => p.uuid === selector);
    if (!profile) throw new Error(`Profile with UUID '${selector}' not found`);
    return this.build(profile.uuid, profile.username);
  }

  private printPrompt(profiles: ProfilesResponse): void {
    this.logger.header("PROFILE SELECTION REQUIRED");
    console.log("  Multiple profiles found. Select one to continue:\n");
    for (const line of this.formatList(profiles)) console.log(line);
    console.log("\n  Run: hytale-auth profile select <number>\n");
  }

  private build(uuid: string, username: string): SelectedProfile {
    return { uuid, username, selectedAt: Math.floor(Date.now() / 1000) };
  }
}
