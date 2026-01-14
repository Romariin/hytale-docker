#!/bin/bash
# =============================================================================
# Server launch utilities
# =============================================================================

build_launch_cmd() {
    local cmd="java"
    
    # Java options
    cmd+=" ${JAVA_OPTS:--Xms4G -Xmx8G}"
    
    # AOT cache
    local aot="${SERVER_DIR}/Server/HytaleServer.aot"
    [[ "${USE_AOT_CACHE:-true}" == "true" ]] && [[ -f "${aot}" ]] && cmd+=" -XX:AOTCache=${aot}"
    
    # Server JAR and args
    cmd+=" -jar ${SERVER_JAR}"
    cmd+=" --assets ${ASSETS_ZIP}"
    cmd+=" --bind 0.0.0.0:${SERVER_PORT:-5520}"
    
    # Add auth tokens if available (from OAuth system)
    if [[ -n "${HYTALE_SERVER_SESSION_TOKEN:-}" ]]; then
        cmd+=" --session-token ${HYTALE_SERVER_SESSION_TOKEN}"
    fi
    if [[ -n "${HYTALE_SERVER_IDENTITY_TOKEN:-}" ]]; then
        cmd+=" --identity-token ${HYTALE_SERVER_IDENTITY_TOKEN}"
    fi
    if [[ -n "${PROFILE_UUID:-}" ]]; then
        cmd+=" --owner-uuid ${PROFILE_UUID}"
    fi
    
    # Optional flags
    [[ "${DISABLE_SENTRY:-false}" == "true" ]] && cmd+=" --disable-sentry"
    [[ -n "${EXTRA_ARGS:-}" ]] && cmd+=" ${EXTRA_ARGS}"
    
    echo "${cmd}"
}

setup_server_io() {
    rm -f "${SERVER_INPUT}" "${SERVER_OUTPUT}"
    mkfifo "${SERVER_INPUT}"
    exec 3<>"${SERVER_INPUT}"
}

start_server() {
    local launch_cmd
    launch_cmd=$(build_launch_cmd)
    
    log_step "Launching server on port ${SERVER_PORT:-5520}"
    log_info "Memory: ${JAVA_OPTS:--Xms4G -Xmx8G}"
    print_divider
    echo ""
    
    cd "${SERVER_DIR}"
    ${launch_cmd} <&3 2>&1 | tee "${SERVER_OUTPUT}" &
    SERVER_PID=$!
    
    # Forward stdin to FIFO
    cat >&3 &
    STDIN_PID=$!
}
