import type { ILogger, SessionTokens, SessionResponse } from "../../types";
import type { TokenStore } from "./TokenStore";

const SESSION_NEW_URL = "https://sessions.hytale.com/game-session/new";
const SESSION_REFRESH_URL = "https://sessions.hytale.com/game-session/refresh";
const SESSION_DELETE_URL = "https://sessions.hytale.com/game-session";
const REFRESH_BUFFER = 300;

/**
 * Game session lifecycle management
 */
export class SessionManager {
  constructor(
    private readonly logger: ILogger,
    private readonly tokenStore: TokenStore,
  ) {}

  async create(profileUuid: string, accessToken: string): Promise<SessionTokens> {
    this.logger.step(`Creating game session for profile ${profileUuid.slice(0, 8)}...`);

    const response = await fetch(SESSION_NEW_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uuid: profileUuid }),
    });

    const data = (await response.json()) as SessionResponse;

    if (data.error) {
      throw new Error(`Failed to create session: ${data.error} - ${data.error_description ?? data.message ?? ""}`);
    }

    if (!data.sessionToken || !data.identityToken || !data.expiresAt) {
      throw new Error("Invalid session response: missing tokens");
    }

    const tokens: SessionTokens = {
      sessionToken: data.sessionToken,
      identityToken: data.identityToken,
      expiresAt: data.expiresAt,
      expiresEpoch: this.parseExpiry(data.expiresAt),
      createdAt: Math.floor(Date.now() / 1000),
    };

    await this.tokenStore.saveSessionTokens(tokens);
    this.logger.success(`Game session created (expires: ${data.expiresAt})`);

    return tokens;
  }

  async refresh(sessionToken: string): Promise<SessionTokens | null> {
    this.logger.step("Refreshing game session");

    const response = await fetch(SESSION_REFRESH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" },
    });

    if (!response.ok) {
      this.logger.warn(`Session refresh failed: HTTP ${response.status}`);
      return null;
    }

    let data: SessionResponse;
    try {
      data = (await response.json()) as SessionResponse;
    } catch (error) {
      this.logger.warn("Session refresh failed: Invalid response");
      return null;
    }

    if (data.sessionToken && data.identityToken && data.expiresAt) {
      const tokens: SessionTokens = {
        sessionToken: data.sessionToken,
        identityToken: data.identityToken,
        expiresAt: data.expiresAt,
        expiresEpoch: this.parseExpiry(data.expiresAt),
        createdAt: Math.floor(Date.now() / 1000),
      };
      await this.tokenStore.saveSessionTokens(tokens);
      this.logger.success("Game session refreshed");
      return tokens;
    }

    this.logger.warn("Session refresh failed: Missing tokens in response");
    return null;
  }

  async terminate(sessionToken: string): Promise<void> {
    this.logger.step("Terminating game session");
    await fetch(SESSION_DELETE_URL, { method: "DELETE", headers: { Authorization: `Bearer ${sessionToken}` } });
    this.logger.success("Game session terminated");
  }

  isExpiring(expiresEpoch: number): boolean {
    return Math.floor(Date.now() / 1000) >= expiresEpoch - REFRESH_BUFFER;
  }

  private parseExpiry(expiresAt: string): number {
    const parsed = Date.parse(expiresAt);
    return Number.isNaN(parsed) ? Math.floor(Date.now() / 1000) + 3600 : Math.floor(parsed / 1000);
  }
}
