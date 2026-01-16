/**
 * Game session tokens from Hytale
 */
export interface SessionTokens {
  sessionToken: string;
  identityToken: string;
  expiresAt: string;
  expiresEpoch: number;
  createdAt: number;
}

/**
 * Session API response
 */
export interface SessionResponse {
  sessionToken?: string;
  identityToken?: string;
  expiresAt?: string;
  error?: string;
  error_description?: string;
  message?: string;
}
