<div align="center">

<img src="docs/public/logo.png" alt="Hytale Docker" width="128" />

# Hytale Docker Server

**Production-ready Docker container for Hytale dedicated servers**

[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/rxmarin/hytale-docker)
[![Java](https://img.shields.io/badge/Java-25-ED8B00?logo=openjdk&logoColor=white)](https://adoptium.net)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/Docs-hytale.romarin.dev-blue)](https://hytale.romarin.dev)

*Automated authentication • Auto-updates • Secure by default*

</div>

---

## ✨ Features

- 🚀 **One-command startup** — Just `docker compose up`, authenticate once, play forever
- 🔐 **OAuth2 Authentication** — Single device code flow for both downloader and server
- 🔄 **Auto-refresh tokens** — Background daemon keeps tokens valid (30-day refresh tokens)
- 📦 **Auto-updates** — Downloads and updates server files automatically
- 🔒 **Secure by default** — Non-root user, dropped capabilities, hardened container
- ⚡ **Fast boot** — AOT cache support for quicker server startup
- 💾 **Persistent data** — Worlds, tokens, and logs survive container restarts

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/romariin/hytale-docker.git
cd hytale-docker/examples

# Start the server
docker compose up -d

# Watch for authentication prompt
docker compose logs -f
```

On first run, you'll see a device authorization prompt. Visit the URL, enter the code, and authorize. The server starts automatically.

Connect to your server at `your-ip:5520` using the Hytale client.

> **Note:** Hytale uses **QUIC over UDP** (not TCP). Forward UDP port 5520 on your firewall.

---

## 📖 Documentation

📚 **[hytale.romarin.dev](https://hytale.romarin.dev)** — Full documentation

Topics covered:
- [Quick Start Guide](https://hytale.romarin.dev/docs/quick-start)
- [Configuration](https://hytale.romarin.dev/docs/configuration)
- [Authentication](https://hytale.romarin.dev/docs/authentication)
- [Network Setup](https://hytale.romarin.dev/docs/network-setup)
- [Security](https://hytale.romarin.dev/docs/security)
- [Troubleshooting](https://hytale.romarin.dev/docs/troubleshooting)

---

## 🏗️ Development

```bash
# Build the image locally
docker build -t hytale-server:latest .

# Run locally with Bun (requires Bun installed)
bun run src/main.ts

# Run the documentation site
cd docs
npm install
npm run dev
```

---

## 🧩 Runtime Architecture (Bun + TypeScript)

The runtime has been migrated from Bash to Bun + TypeScript for better maintainability and type safety.

### Project Structure

```
src/
├── main.ts              # Entrypoint (replaces scripts/entrypoint.sh)
├── hytale-auth.ts       # Auth CLI entrypoint
├── hytale-cmd.ts        # Command CLI entrypoint
├── types/               # Type definitions
│   ├── Config.ts        # Configuration types
│   ├── OAuth.ts         # OAuth token types
│   ├── Sessions.ts      # Session token types
│   ├── Profiles.ts      # Profile types
│   ├── Download.ts      # Downloader types
│   ├── Server.ts        # Server launch types
│   └── Logging.ts       # Logger interface
└── modules/             # Runtime modules
    ├── Config.ts        # Environment configuration
    ├── Logger.ts        # Colored console output
    ├── TokenStore.ts    # Token persistence
    ├── OAuthClient.ts   # RFC 8628 Device Code Flow
    ├── ProfileManager.ts# Profile selection
    ├── SessionManager.ts# Game session lifecycle
    ├── AuthMonitor.ts   # Background token refresh
    ├── AuthService.ts   # High-level auth operations
    ├── AuthCli.ts       # CLI commands
    ├── VersionService.ts# Update detection
    ├── DownloadManager.ts# Server download/extraction
    ├── ServerProcess.ts # Server launch & I/O
    ├── Preflight.ts     # System checks
    └── CommandClient.ts # FIFO command sender
```

### Key Changes from Bash

| Bash | Bun + TypeScript |
|------|------------------|
| `curl` | `fetch()` API |
| `jq` | Native JSON parsing |
| Shell scripts | Typed modules |
| `source` includes | ES module imports |

### CLI Usage

```bash
# Inside container
hytale-auth login           # Device code auth
hytale-auth profile list    # List profiles
hytale-auth profile select 1# Select profile
hytale-auth session         # Create session
hytale-auth status          # Token status
hytale-cmd /help            # Send server command
```

---

## 📚 References

- [Hytale Server Manual](https://support.hytale.com/hc/en-us/articles/45326769420827-Hytale-Server-Manual)
- [Server Provider Authentication Guide](https://support.hytale.com/hc/en-us/articles/45328341414043-Server-Provider-Authentication-Guide)

---

<div align="center">

**Made with ❤️ by [romarin.dev](https://romarin.dev)**

[Documentation](https://hytale.romarin.dev) •
[Report Bug](https://github.com/rxmarin/hytale-docker/issues) •
[Request Feature](https://github.com/rxmarin/hytale-docker/issues)

</div>