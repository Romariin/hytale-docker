import type { ILogger, OAuthTokens, SessionTokens } from "../../types";
import type { TokenStore } from "./TokenStore";
import type { OAuthClient } from "./OAuthClient";
import type { ProfileManager } from "./ProfileManager";
import type { SessionManager } from "./SessionManager";

/**
 * High-level authentication orchestrator with background refresh
 */
export class AuthService {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly logger: ILogger,
    private readonly tokenStore: TokenStore,
    private readonly oauthClient: OAuthClient,
    private readonly profileManager: ProfileManager,
    private readonly sessionManager: SessionManager,
  ) {}

  /**
   * Ensure valid OAuth tokens for the downloader
   * Always refreshes tokens to ensure they're valid
   */
  async ensureDownloaderAuth(): Promise<OAuthTokens> {
    const existing = await this.tokenStore.loadOAuthTokens();

    if (existing) {
      // Always try to refresh to ensure token is valid
      try {
        return await this.oauthClient.refreshToken(existing.refreshToken);
      } catch {
        this.logger.warn("Token refresh failed, starting new auth flow");
      }
    }

    this.logger.step("Authenticating for server download");
    const device = await this.oauthClient.requestDeviceCode();
    return await this.oauthClient.pollForToken(device);
  }

  /**
   * Ensure a valid game session exists
   */
  async ensureValidSession(): Promise<SessionTokens | null> {
    const session = await this.tokenStore.loadSessionTokens();

    if (session && !this.sessionManager.isExpiring(session.expiresEpoch)) {
      this.logger.info("Session tokens valid");
      return session;
    }

    if (session) {
      const refreshed = await this.sessionManager.refresh(session.sessionToken);
      if (refreshed) return refreshed;
    }

    const oauth = await this.tokenStore.loadOAuthTokens();
    if (!oauth) {
      this.logger.error("No valid tokens available. Run device auth flow.");
      return null;
    }

    let accessToken = oauth.accessToken;
    if (this.oauthClient.needsRefresh(oauth.expiresAt)) {
      const refreshed = await this.oauthClient.refreshToken(oauth.refreshToken);
      accessToken = refreshed.accessToken;
    }

    const profiles = await this.oauthClient.getProfiles(accessToken);
    const selected = await this.profileManager.select(profiles);

    if (!selected) return null;
    return await this.sessionManager.create(selected.uuid, accessToken);
  }

  /**
   * Start background token refresh (every 60s)
   */
  startBackgroundRefresh(): void {
    if (this.refreshTimer) return;

    this.refreshTimer = setInterval(() => this.backgroundRefresh(), 60_000);
    this.logger.info("Token refresh monitor started");
  }

  /**
   * Stop background refresh
   */
  stopBackgroundRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Terminate active session (cleanup)
   */
  async terminateSession(): Promise<void> {
    const session = await this.tokenStore.loadSessionTokens();
    if (session) {
      try {
        await this.sessionManager.terminate(session.sessionToken);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Print token status
   */
  async printStatus(): Promise<void> {
    console.log("\nToken Status:");
    console.log("─".repeat(41));

    const oauth = await this.tokenStore.loadOAuthTokens();
    if (oauth) {
      const remaining = oauth.expiresAt - Math.floor(Date.now() / 1000);
      console.log(`  OAuth Access Token:  Present (expires in ${remaining}s)`);
      console.log(`  OAuth Refresh Token: Present`);
    } else {
      console.log(`  OAuth Tokens:        Not found`);
    }

    const session = await this.tokenStore.loadSessionTokens();
    if (session) {
      const remaining = session.expiresEpoch - Math.floor(Date.now() / 1000);
      console.log(`  Session Token:       Present (expires in ${remaining}s)`);
      console.log(`  Identity Token:      Present`);
    } else {
      console.log(`  Session Tokens:      Not found`);
    }

    const profiles = await this.tokenStore.loadProfiles();
    if (profiles?.profiles.length) {
      console.log(`  Profile:             ${profiles.profiles[0].username}`);
    }

    console.log("");
  }

  private async backgroundRefresh(): Promise<void> {
    try {
      const session = await this.tokenStore.loadSessionTokens();
      if (session && this.sessionManager.isExpiring(session.expiresEpoch)) {
        const refreshed = await this.sessionManager.refresh(session.sessionToken);
        if (!refreshed) await this.createNewSession();
      }

      const oauth = await this.tokenStore.loadOAuthTokens();
      if (oauth && this.oauthClient.needsRefresh(oauth.expiresAt)) {
        await this.oauthClient.refreshToken(oauth.refreshToken);
      }
    } catch (error) {
      this.logger.warn(`Token refresh failed: ${(error as Error).message}`);
    }
  }

  private async createNewSession(): Promise<void> {
    const oauth = await this.tokenStore.loadOAuthTokens();
    if (!oauth) return;

    let accessToken = oauth.accessToken;
    if (this.oauthClient.needsRefresh(oauth.expiresAt)) {
      const refreshed = await this.oauthClient.refreshToken(oauth.refreshToken);
      accessToken = refreshed.accessToken;
    }

    const profiles = await this.oauthClient.getProfiles(accessToken);
    const selected = await this.profileManager.select(profiles);
    if (selected) {
      await this.sessionManager.create(selected.uuid, accessToken);
    }
  }
}
