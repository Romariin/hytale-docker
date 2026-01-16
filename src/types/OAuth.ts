/**
 * OAuth2 device code response from Hytale
 */
export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in?: number;
  interval?: number;
}

/**
 * OAuth2 token response from Hytale
 */
export interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * Stored OAuth tokens
 */
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  createdAt: number;
}

/**
 * Device code polling state
 */
export interface DeviceCodeState {
  deviceCode: string;
  expiresIn: number;
  interval: number;
}
