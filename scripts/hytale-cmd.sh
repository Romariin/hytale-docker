#!/bin/bash
# Simple wrapper to send commands to the Hytale server
# Usage: hytale-cmd /help

if [ -z "$1" ]; then
    echo "Usage: hytale-cmd <command>"
    echo "Example: hytale-cmd /auth status"
    exit 1
fi

if [ ! -p /tmp/server_input ]; then
    echo "Error: Server not running or FIFO not found"
    exit 1
fi

# Get current line count before sending command
lines_before=$(wc -l < /tmp/server_output.log 2>/dev/null || echo 0)

# Send command
echo "$*" > /tmp/server_input

# Wait briefly for response and show new output
sleep 0.5
tail -n +$((lines_before + 1)) /tmp/server_output.log 2>/dev/null
