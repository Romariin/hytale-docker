/**
 * Server launch configuration
 */
export interface LaunchOptions {
  javaOpts: string;
  serverJar: string;
  assetsZip: string;
  serverPort: number;
  sessionToken?: string;
  identityToken?: string;
  ownerUuid?: string;
  disableSentry: boolean;
  extraArgs: string;
  aotCachePath?: string;
}

/**
 * Handle to a running server process
 */
export interface ServerHandle {
  pid: number;
  kill: () => void;
  wait: () => Promise<number>;
}
