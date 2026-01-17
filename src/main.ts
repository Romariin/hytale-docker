import { existsSync, unlinkSync } from "node:fs";
import {
  Config,
  Logger,
  TokenStore,
  OAuthClient,
  ProfileManager,
  SessionManager,
  AuthService,
  CurseForgeManager,
  DownloadManager,
  UpdateManager,
  VersionService,
  ServerProcess,
} from "./modules";

const PENDING_UPDATE_FILE = "/server/.pending_update";

// ─────────────────────────────────────────────────────────────────────────────
// Initialize
// ─────────────────────────────────────────────────────────────────────────────

const logger = new Logger();
const config = new Config();
const tokenStore = new TokenStore(config.paths);
const oauthClient = new OAuthClient(logger, tokenStore);
const profileManager = new ProfileManager(logger, tokenStore, config.autoSelectProfile);
const sessionManager = new SessionManager(logger, tokenStore);
const authService = new AuthService(logger, tokenStore, oauthClient, profileManager, sessionManager);
const versionService = new VersionService(logger, config.paths);
const updateManager = new UpdateManager(logger, config, config.paths, versionService);
const downloadManager = new DownloadManager(logger, config, config.paths, versionService);
const serverProcess = new ServerProcess(logger, config, config.paths);

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────

let serverHandle: ReturnType<typeof serverProcess.start> | null = null;
let shuttingDown = false;

async function cleanup(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info("Shutting down...");
  authService.stopBackgroundRefresh();
  await authService.terminateSession();
  serverHandle?.kill();
  process.exit(0);
}

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
process.on("SIGQUIT", cleanup);

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Check for scheduled update (manual update when AUTO_UPDATE=false)
  let forceUpdate = false;
  if (existsSync(PENDING_UPDATE_FILE)) {
    logger.info("Scheduled update detected");
    forceUpdate = true;
    unlinkSync(PENDING_UPDATE_FILE);
  }

  // Auth & write credentials
  const tokens = await authService.ensureDownloaderAuth();
  await downloadManager.writeCredentials(tokens);

  // Check for updates and show header
  const updateAvailable = await updateManager.showHeaderAndCheckUpdates();
  const needsDownload = forceUpdate || updateAvailable;

  // Only download if needed
  if (needsDownload) {
    await downloadManager.downloadServer(tokens);
  } else {
    logger.success("Server files up to date");
  }

  // Sync CurseForge mods if configured
  if (config.cfApiKey && config.cfMods) {
    const cfManager = new CurseForgeManager(logger, config.cfApiKey);
    const modEntries = CurseForgeManager.parseModsConfig(config.cfMods);
    await cfManager.syncMods(modEntries);
  }

  // Session - Always create fresh session on startup to avoid stale tokens
  let session = await authService.ensureValidSession(true);

  if (!session) {
    logger.warn("Waiting for profile selection...");
    logger.info("Run: docker exec -it hytale-server hytale-auth profile select <n>");

    while (!session) {
      await Bun.sleep(5000);
      const selected = await tokenStore.loadSelectedProfile();
      if (selected) {
        logger.success(`Profile selected: ${selected.username}`);
        session = await authService.ensureValidSession(true);
      }
    }
  }

  const selectedProfile = await tokenStore.loadSelectedProfile();

  // Start server
  const options = serverProcess.buildOptions(
    session?.sessionToken,
    session?.identityToken,
    selectedProfile?.uuid,
  );

  serverHandle = serverProcess.start(options);

  if (config.autoRefreshTokens) {
    authService.startBackgroundRefresh();
  }

  const exitCode = await serverHandle.wait();
  await cleanup();
  process.exit(exitCode);
}

main().catch((error) => {
  logger.error((error as Error).message);
  process.exit(1);
});
