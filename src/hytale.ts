import {
  Config,
  Logger,
  TokenStore,
  OAuthClient,
  ProfileManager,
  SessionManager,
  AuthService,
  HytaleCli,
} from "./modules";

const logger = new Logger();
const config = new Config();
const tokenStore = new TokenStore(config.paths);
const oauthClient = new OAuthClient(logger, tokenStore);
const profileManager = new ProfileManager(logger, tokenStore, config.autoSelectProfile);
const sessionManager = new SessionManager(logger, tokenStore);
const authService = new AuthService(logger, tokenStore, oauthClient, profileManager, sessionManager);

const cli = new HytaleCli(
  logger,
  config,
  tokenStore,
  oauthClient,
  profileManager,
  sessionManager,
  authService,
);

cli.run(process.argv).catch((error) => {
  logger.error((error as Error).message);
  process.exit(1);
});
