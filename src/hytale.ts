import {
  Config,
  Logger,
  TokenStore,
  OAuthClient,
  ProfileManager,
  SessionManager,
  AuthService,
  HytaleCli,
  UpdateManager,
  VersionService,
} from "./modules";

const logger = new Logger();
const config = new Config();
const tokenStore = new TokenStore(config.paths);
const oauthClient = new OAuthClient(logger, tokenStore);
const profileManager = new ProfileManager(logger, tokenStore, config.autoSelectProfile);
const sessionManager = new SessionManager(logger, tokenStore);
const authService = new AuthService(logger, tokenStore, oauthClient, profileManager, sessionManager);
const versionService = new VersionService(logger, config.paths);
const updateManager = new UpdateManager(logger, config, config.paths, versionService);

const cli = new HytaleCli(
  logger,
  config,
  tokenStore,
  oauthClient,
  profileManager,
  sessionManager,
  authService,
  updateManager,
);

cli.run(process.argv).catch((error) => {
  logger.error((error as Error).message);
  process.exit(1);
});
