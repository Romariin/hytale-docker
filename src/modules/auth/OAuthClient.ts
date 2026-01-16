import type { ILogger, DeviceCodeResponse, TokenResponse, OAuthTokens, DeviceCodeState, ProfilesResponse } from "../../types";
import type { TokenStore } from "./TokenStore";

const CLIENT_ID = "hytale-server";
const SCOPES = "openid offline auth:server";
const DEVICE_AUTH_URL = "https://oauth.accounts.hytale.com/oauth2/device/auth";
const TOKEN_URL = "https://oauth.accounts.hytale.com/oauth2/token";
const PROFILES_URL = "https://account-data.hytale.com/my-account/get-profiles";
const REFRESH_BUFFER = 300; // 5 minutes

/**
 * OAuth2 client implementing RFC 8628 Device Code Flow
 */
export class OAuthClient {
  constructor(
    private readonly logger: ILogger,
    private readonly tokenStore: TokenStore,
  ) {}

  async requestDeviceCode(): Promise<DeviceCodeState> {
    this.logger.step("Requesting device authorization code");

    const response = await fetch(DEVICE_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPES }),
    });

    const data = (await response.json()) as DeviceCodeResponse;

    if (!data.device_code || !data.user_code || !data.verification_uri) {
      throw new Error(`Invalid device code response: ${JSON.stringify(data)}`);
    }

    const expiresIn = data.expires_in ?? 900;
    const interval = data.interval ?? 5;

    this.logger.header("DEVICE AUTHORIZATION REQUIRED");
    console.log(`  Visit: ${data.verification_uri}`);
    console.log(`  Code:  ${data.user_code}`);
    if (data.verification_uri_complete) {
      console.log(`\n  Or open directly: ${data.verification_uri_complete}`);
    }
    console.log(`\n  Code expires in ${expiresIn} seconds\n`);

    return { deviceCode: data.device_code, expiresIn, interval };
  }

  async pollForToken(state: DeviceCodeState): Promise<OAuthTokens> {
    this.logger.step(`Waiting for authorization (polling every ${state.interval}s)...`);

    let elapsed = 0;
    let { interval } = state;

    while (elapsed < state.expiresIn) {
      await Bun.sleep(interval * 1000);
      elapsed += interval;

      const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: state.deviceCode,
        }),
      });

      const data = (await response.json()) as TokenResponse;

      if (data.error) {
        if (data.error === "authorization_pending") continue;
        if (data.error === "slow_down") {
          interval += 5;
          this.logger.warn(`Rate limited, slowing to ${interval}s`);
          continue;
        }
        if (data.error === "expired_token") throw new Error("Device code expired");
        if (data.error === "access_denied") throw new Error("Authorization denied");
        throw new Error(`Token error: ${data.error}`);
      }

      if (data.access_token && data.refresh_token) {
        const tokens = this.createTokens(data);
        await this.tokenStore.saveOAuthTokens(tokens);
        this.logger.success("Authorization successful!");
        return tokens;
      }
    }

    throw new Error("Device code expired (timeout)");
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    this.logger.step("Refreshing OAuth access token");

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const data = (await response.json()) as TokenResponse;

    if (data.error) throw new Error(`Token refresh failed: ${data.error}`);
    if (!data.access_token) throw new Error("No access token in refresh response");

    const tokens = this.createTokens({ ...data, refresh_token: data.refresh_token ?? refreshToken });
    await this.tokenStore.saveOAuthTokens(tokens);

    const remaining = tokens.expiresAt - Math.floor(Date.now() / 1000);
    this.logger.success(`OAuth token refreshed (expires in ${remaining}s)`);

    return tokens;
  }

  async getProfiles(accessToken: string): Promise<ProfilesResponse> {
    this.logger.step("Fetching game profiles");

    const response = await fetch(PROFILES_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });

    if (!response.ok) throw new Error(`Failed to get profiles: HTTP ${response.status}`);

    const profiles = (await response.json()) as ProfilesResponse;
    await this.tokenStore.saveProfiles(profiles);

    this.logger.success(`Found ${profiles.profiles.length} profile(s) for account ${profiles.owner.slice(0, 8)}...`);
    return profiles;
  }

  needsRefresh(expiresAt: number): boolean {
    return Math.floor(Date.now() / 1000) >= expiresAt - REFRESH_BUFFER;
  }

  private createTokens(data: TokenResponse): OAuthTokens {
    const now = Math.floor(Date.now() / 1000);
    return {
      accessToken: data.access_token!,
      refreshToken: data.refresh_token!,
      expiresAt: now + (data.expires_in ?? 3600),
      createdAt: now,
    };
  }
}
