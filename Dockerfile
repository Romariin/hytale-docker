# ── Build binaries ───────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS build

ARG TARGETARCH
WORKDIR /app

COPY package.json bun.lock* tsconfig.json ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

COPY src/ src/

RUN BUN_TARGET=$([ "$TARGETARCH" = "arm64" ] && echo "bun-linux-arm64" || echo "bun-linux-x64-baseline") && \
    bun build src/main.ts --compile --target=$BUN_TARGET --outfile=hytale-server && \
    bun build src/hytale.ts --compile --target=$BUN_TARGET --outfile=hytale

# ── Fetch downloader ─────────────────────────────────────────────────────────
FROM alpine:3.20 AS downloader

ARG TARGETARCH
RUN apk add --no-cache curl unzip && \
    curl -fsSL https://downloader.hytale.com/hytale-downloader.zip -o /tmp/dl.zip && \
    unzip -q /tmp/dl.zip -d /tmp && \
    ARCH=$([ "$TARGETARCH" = "arm64" ] && echo "arm64" || echo "amd64") && \
    mv /tmp/hytale-downloader-linux-$ARCH /hytale-downloader && \
    chmod +x /hytale-downloader

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM eclipse-temurin:25-jre-alpine

RUN apk add --no-cache tini libstdc++ gcompat unzip && \
    adduser -D -u 1000 -h /server hytale

COPY --from=build /app/hytale-server /app/hytale /usr/local/bin/
COPY --from=downloader /hytale-downloader /usr/local/bin/
RUN chmod +x /usr/local/bin/hytale-server /usr/local/bin/hytale /usr/local/bin/hytale-downloader

RUN mkdir -p /server/.hytale/tokens && chown -R hytale:hytale /server

ENV JAVA_OPTS="-Xms4G -Xmx8G" \
    SERVER_PORT=5520 \
    PATCHLINE=release \
    FORCE_UPDATE=false \
    AUTO_UPDATE=false \
    USE_AOT_CACHE=true \
    DISABLE_SENTRY=false \
    AUTO_REFRESH_TOKENS=true \
    AUTOSELECT_GAME_PROFILE=true

WORKDIR /server
VOLUME /server
EXPOSE 5520/udp
USER hytale

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD pgrep -f HytaleServer || exit 1

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["hytale-server"]

STOPSIGNAL SIGTERM