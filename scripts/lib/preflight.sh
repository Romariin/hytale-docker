#!/bin/bash
# =============================================================================
# Pre-flight checks
# =============================================================================

preflight_checks() {
    log_step "Running pre-flight checks"
    
    # Java version
    local java_ver
    java_ver=$(java --version 2>&1 | head -n1 | sed 's/[^0-9]*\([0-9]*\).*/\1/')
    if [[ "${java_ver}" -lt 25 ]]; then
        log_error "Java 25+ required (found: ${java_ver})"
        exit 1
    fi
    
    # hytale-downloader version
    local dl_version="unknown"
    if command -v hytale-downloader &>/dev/null; then
        dl_version=$(hytale-downloader -version 2>&1 | head -n1 || echo "unknown")
        echo "${dl_version}" > "${VERSION_FILE}"
    else
        log_error "hytale-downloader not found"
        exit 1
    fi
    
    # Required tools
    for tool in unzip; do
        command -v "${tool}" &>/dev/null || { log_error "Missing: ${tool}"; exit 1; }
    done
    
    log_success "Java ${java_ver} | Downloader ${dl_version}"
}
