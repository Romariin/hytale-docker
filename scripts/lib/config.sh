#!/bin/bash
# =============================================================================
# Configuration constants
# =============================================================================

readonly SERVER_DIR="/server"
readonly SERVER_JAR="${SERVER_DIR}/Server/HytaleServer.jar"
readonly ASSETS_ZIP="${SERVER_DIR}/Assets.zip"
readonly VERSION_FILE="${SERVER_DIR}/.downloader_version"
readonly VERSION_INFO_FILE="${SERVER_DIR}/.version_info"
readonly HYTALE_DOWNLOADER="/usr/local/bin/hytale-downloader"
readonly SERVER_INPUT="/tmp/server_input"
readonly SERVER_OUTPUT="/tmp/server_output.log"
