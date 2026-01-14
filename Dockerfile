# =============================================================================
# Hytale Dedicated Server Docker Image
# =============================================================================

FROM eclipse-temurin:25-jre AS base

ARG TARGETARCH

LABEL org.opencontainers.image.title="Hytale Server" \
      org.opencontainers.image.description="Hytale dedicated game server" \
      org.opencontainers.image.licenses="MIT"

# =============================================================================
# Install dependencies
# =============================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    tini \
    procps \
    jq \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Create user and directories
# =============================================================================
RUN groupadd -g 1000 hytale 2>/dev/null || true && \
    useradd -u 1000 -g 1000 -d /home/hytale -m -s /bin/bash hytale 2>/dev/null || true && \
    mkdir -p /server /home/hytale/.config/hytale/tokens /home/hytale/.cache/hytale && \
    chown -R 1000:1000 /server /home/hytale

# =============================================================================
# Download hytale-downloader
# =============================================================================
WORKDIR /tmp
RUN curl -fsSL -o hytale-downloader.zip "https://downloader.hytale.com/hytale-downloader.zip" \
    && unzip hytale-downloader.zip -d hytale-downloader \
    && if [ "$TARGETARCH" = "arm64" ]; then \
         mv hytale-downloader/hytale-downloader-linux-arm64 /usr/local/bin/hytale-downloader; \
       else \
         mv hytale-downloader/hytale-downloader-linux-amd64 /usr/local/bin/hytale-downloader; \
       fi \
    && chmod +x /usr/local/bin/hytale-downloader \
    && rm -rf hytale-downloader.zip hytale-downloader

# =============================================================================
# Copy scripts
# =============================================================================
WORKDIR /server
COPY --chown=1000:1000 scripts/entrypoint.sh /server/scripts/
COPY --chown=1000:1000 scripts/lib/ /server/scripts/lib/
COPY --chown=1000:1000 scripts/hytale-cmd.sh /usr/local/bin/hytale-cmd
COPY --chown=1000:1000 scripts/hytale-auth.sh /usr/local/bin/hytale-auth
RUN chmod +x /server/scripts/entrypoint.sh /usr/local/bin/hytale-cmd /usr/local/bin/hytale-auth

# =============================================================================
# Environment variables
# =============================================================================
ENV JAVA_OPTS="-Xms4G -Xmx8G" \
    SERVER_PORT="5520" \
    PATCHLINE="release" \
    FORCE_UPDATE="false" \
    USE_AOT_CACHE="true" \
    DISABLE_SENTRY="false" \
    AUTO_REFRESH_TOKENS="true" \
    AUTOSELECT_GAME_PROFILE="true" \
    EXTRA_ARGS="" \
    TZ="UTC"

# =============================================================================
# Expose port and volumes
# =============================================================================
EXPOSE 5520/udp

VOLUME ["/server", "/home/hytale"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD pgrep -f "HytaleServer.jar" > /dev/null || exit 1

# =============================================================================
# Run as non-root
# =============================================================================
USER 1000:1000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/server/scripts/entrypoint.sh"]
