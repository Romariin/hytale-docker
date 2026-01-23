<div align="center">

<img src="docs/public/logo.png" alt="Hytale Docker" width="128" />

# Hytale Docker Server

**Production-ready Docker container for Hytale dedicated servers**

[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/rxmarin/hytale-docker)
[![Java](https://img.shields.io/badge/Java-25-ED8B00?logo=openjdk&logoColor=white)](https://adoptium.net)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/Docs-hytale.romarin.dev-blue)](https://hytale.romarin.dev)

*Automated authentication • Auto-updates • CurseForge mods • Secure by default*

</div>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🚀 **One-command startup** | Just `docker compose up`, authenticate once, play forever |
| 🔐 **OAuth2 Authentication** | Device code flow with 30-day persistent tokens |
| 🔄 **Auto-updates** | Optional automatic server updates on restart |
| 🧩 **CurseForge Mods** | Auto-sync mods with `CF_MODS` environment variable |
| 💻 **Unified CLI** | Single `hytale` command for auth, updates, mods, and server commands |
| 🔒 **Secure by default** | Non-root user, dropped capabilities, hardened container |
| ⚡ **Fast boot** | AOT cache support for quicker server startup |
| 💾 **Persistent data** | Worlds, tokens, and mods survive restarts |

---

## 🚀 Quick Start

Create a `docker-compose.yml`:

```yaml
services:
  hytale:
    image: rxmarin/hytale-docker:latest
    container_name: hytale-server
    restart: unless-stopped
    stdin_open: true
    tty: true
    ports:
      - "5520:5520/udp"
    environment:
      JAVA_OPTS: "-Xms4G -Xmx8G"
      AUTO_UPDATE: "true"
    volumes:
      - hytale-data:/server

volumes:
  hytale-data:
```

Start the server:

```bash
docker compose up -d
docker compose logs -f  # Watch for auth prompt
```

On first run, you'll see a device authorization prompt. Visit the URL, enter the code, and authorize. The server starts automatically.

Connect to `your-ip:5520` using the Hytale client.

> **Note:** Hytale uses **QUIC over UDP** (not TCP). Forward UDP port 5520 on your firewall.

---

## 💻 CLI Usage

```bash
# Auth
docker exec -it hytale-server hytale auth status
docker exec -it hytale-server hytale auth login

# Server commands
docker exec -it hytale-server hytale cmd /help
docker exec -it hytale-server hytale cmd /list

# Updates
docker exec -it hytale-server hytale update check
docker exec -it hytale-server hytale update schedule

# CurseForge mods
docker exec -it hytale-server hytale mods list
```

---

## 🧩 CurseForge Mods

Auto-sync mods from CurseForge:

```yaml
environment:
  CF_API_KEY: "${CF_API_KEY}"  # From .env file  #NOTE: $ needs to be escaped via $$ syntax or you might get 403 errors in the logs.
  CF_MODS: "123456,789012"
```

See [CurseForge documentation](https://hytale.romarin.dev/docs/curseforge) for setup.

---

## 📖 Documentation

📚 **[hytale.romarin.dev](https://hytale.romarin.dev)** — Full documentation

- [Quick Start](https://hytale.romarin.dev/docs/quick-start)
- [Configuration](https://hytale.romarin.dev/docs/configuration)
- [CLI Reference](https://hytale.romarin.dev/docs/cli)
- [CurseForge Mods](https://hytale.romarin.dev/docs/curseforge)
- [Authentication](https://hytale.romarin.dev/docs/authentication)
- [Troubleshooting](https://hytale.romarin.dev/docs/troubleshooting)

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JAVA_OPTS` | `-Xms4G -Xmx8G` | JVM memory options |
| `AUTO_UPDATE` | `false` | Auto-update server on restart |
| `PATCHLINE` | `release` | Release channel |
| `USE_AOT_CACHE` | `true` | Faster startup |
| `CF_API_KEY` | — | CurseForge API key |
| `CF_MODS` | — | Comma-separated mod IDs |

See [Configuration](https://hytale.romarin.dev/docs/configuration) for all options.

---

## 🏗️ Development

```bash
# Build the image locally
docker build -t hytale-server:latest .

# Run locally with Bun
bun run src/main.ts

# Run documentation site
cd docs && pnpm install && pnpm dev
```

---

## 📚 References

- [Hytale Server Manual](https://support.hytale.com/hc/en-us/articles/45326769420827-Hytale-Server-Manual)
- [Server Provider Authentication Guide](https://support.hytale.com/hc/en-us/articles/45328341414043-Server-Provider-Authentication-Guide)

---

<div align="center">

**Made with ❤️ by [romarin.dev](https://romarin.dev)**

[Documentation](https://hytale.romarin.dev) •
[Discord Support](https://discord.gg/FewwuUFqbw) •
[Report Bug](https://github.com/rxmarin/hytale-docker/issues) •
[Request Feature](https://github.com/rxmarin/hytale-docker/issues)

</div>