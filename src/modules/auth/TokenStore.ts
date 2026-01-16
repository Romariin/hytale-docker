import { mkdir, readFile, writeFile, chmod, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Paths, OAuthTokens, ProfilesResponse, SelectedProfile, SessionTokens } from "../../types";

/**
 * Persistent storage for all tokens
 */
export class TokenStore {
  constructor(private readonly paths: Paths) {}

  private async ensureDir(): Promise<void> {
    await mkdir(this.paths.TOKEN_DIR, { recursive: true, mode: 0o700 });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // OAuth
  // ─────────────────────────────────────────────────────────────────────────────

  async saveOAuthTokens(tokens: OAuthTokens): Promise<void> {
    await this.ensureDir();
    const data = {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      created_at: tokens.createdAt,
    };
    await writeFile(this.paths.OAUTH_TOKEN_FILE, JSON.stringify(data, null, 2));
    await chmod(this.paths.OAUTH_TOKEN_FILE, 0o600);
  }

  async loadOAuthTokens(): Promise<OAuthTokens | null> {
    if (!existsSync(this.paths.OAUTH_TOKEN_FILE)) return null;
    try {
      const raw = await readFile(this.paths.OAUTH_TOKEN_FILE, "utf-8");
      const data = JSON.parse(raw);
      if (!data.access_token || !data.refresh_token) return null;
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at ?? 0,
        createdAt: data.created_at ?? Math.floor(Date.now() / 1000),
      };
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Profiles
  // ─────────────────────────────────────────────────────────────────────────────

  async saveProfiles(profiles: ProfilesResponse): Promise<void> {
    await this.ensureDir();
    await writeFile(this.paths.PROFILE_CACHE_FILE, JSON.stringify(profiles, null, 2));
    await chmod(this.paths.PROFILE_CACHE_FILE, 0o600);
  }

  async loadProfiles(): Promise<ProfilesResponse | null> {
    if (!existsSync(this.paths.PROFILE_CACHE_FILE)) return null;
    try {
      const raw = await readFile(this.paths.PROFILE_CACHE_FILE, "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async saveSelectedProfile(profile: SelectedProfile): Promise<void> {
    await this.ensureDir();
    await writeFile(this.paths.SELECTED_PROFILE_FILE, JSON.stringify(profile, null, 2));
    await chmod(this.paths.SELECTED_PROFILE_FILE, 0o600);
  }

  async loadSelectedProfile(): Promise<SelectedProfile | null> {
    if (!existsSync(this.paths.SELECTED_PROFILE_FILE)) return null;
    try {
      const raw = await readFile(this.paths.SELECTED_PROFILE_FILE, "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Sessions
  // ─────────────────────────────────────────────────────────────────────────────

  async saveSessionTokens(tokens: SessionTokens): Promise<void> {
    await this.ensureDir();
    await writeFile(this.paths.SESSION_TOKEN_FILE, JSON.stringify(tokens, null, 2));
    await chmod(this.paths.SESSION_TOKEN_FILE, 0o600);
  }

  async loadSessionTokens(): Promise<SessionTokens | null> {
    if (!existsSync(this.paths.SESSION_TOKEN_FILE)) return null;
    try {
      const raw = await readFile(this.paths.SESSION_TOKEN_FILE, "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────────

  async clearAll(): Promise<void> {
    const files = [
      this.paths.OAUTH_TOKEN_FILE,
      this.paths.SESSION_TOKEN_FILE,
      this.paths.PROFILE_CACHE_FILE,
      this.paths.SELECTED_PROFILE_FILE,
    ];
    await Promise.all(files.map((f) => rm(f, { force: true })));
  }
}
