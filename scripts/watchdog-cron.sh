#!/bin/bash
# ──────────────────────────────────────────────────────────────
# WATCHDOG CRON — External dead-brain detection
#
# This runs OUTSIDE the brain process via system crontab.
# If the brain process is dead, it:
#   1. Sends RED ALERT to Telegram
#   2. Attempts to restart the service
#   3. Logs the event
#
# Install: crontab -e
#   */10 * * * * /home/ec2-user/arpit-brain-trainer/scripts/watchdog-cron.sh
# ──────────────────────────────────────────────────────────────

BRAIN_SERVICE="arpit-brain"
LOG_FILE="/home/ec2-user/arpit-brain-trainer/logs/watchdog.log"
HEALTH_URL="http://localhost:3000/health"

# Load env for Telegram credentials
source /home/ec2-user/arpit-brain-trainer/.env

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# ─── Check 1: Is the systemd service running? ───────────────

SERVICE_STATUS=$(systemctl is-active $BRAIN_SERVICE 2>/dev/null)

if [ "$SERVICE_STATUS" != "active" ]; then
    echo "[$TIMESTAMP] 🚨 Service NOT active (status: $SERVICE_STATUS)" >> "$LOG_FILE"

    # Send RED ALERT to Telegram
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_CHAT_ID}" \
            -d "parse_mode=Markdown" \
            -d "text=🚨🚨🚨 *RED ALERT — BRAIN PROCESS DEAD!*

Service: $BRAIN_SERVICE
Status: $SERVICE_STATUS
Time: $TIMESTAMP

⚡ *Auto-restarting...*" > /dev/null
    fi

    # Attempt restart
    sudo systemctl restart $BRAIN_SERVICE
    sleep 5

    NEW_STATUS=$(systemctl is-active $BRAIN_SERVICE 2>/dev/null)
    echo "[$TIMESTAMP] 🔄 Restart attempted. New status: $NEW_STATUS" >> "$LOG_FILE"

    if [ "$NEW_STATUS" = "active" ]; then
        if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
            curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
                -d "chat_id=${TELEGRAM_CHAT_ID}" \
                -d "parse_mode=Markdown" \
                -d "text=✅ *Brain restarted successfully!*

Service is back online." > /dev/null
        fi
    else
        if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
            curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
                -d "chat_id=${TELEGRAM_CHAT_ID}" \
                -d "parse_mode=Markdown" \
                -d "text=🚨 *RESTART FAILED!*

Brain could not be restarted. Manual intervention needed.
\`sudo systemctl status arpit-brain\`
\`journalctl -u arpit-brain -n 50\`" > /dev/null
        fi
    fi
    exit 0
fi

# ─── Check 2: Is the API server responding? ──────────────────

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 $HEALTH_URL 2>/dev/null)

if [ "$HTTP_STATUS" != "200" ]; then
    echo "[$TIMESTAMP] ⚠️ API not responding (HTTP: $HTTP_STATUS)" >> "$LOG_FILE"

    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_CHAT_ID}" \
            -d "parse_mode=Markdown" \
            -d "text=⚠️ *Brain API not responding!*

Health check failed (HTTP: $HTTP_STATUS)
Service is running but API may be stuck.
Restarting..." > /dev/null
    fi

    sudo systemctl restart $BRAIN_SERVICE
    echo "[$TIMESTAMP] 🔄 Restarted due to unresponsive API" >> "$LOG_FILE"
fi
