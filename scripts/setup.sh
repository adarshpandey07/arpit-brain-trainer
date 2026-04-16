#!/bin/bash
# ──────────────────────────────────────────────────────────────
# ARPIT BRAIN TRAINER — Setup Script for EC2
#
# Run this on the EC2 server to deploy the brain:
#   chmod +x scripts/setup.sh && ./scripts/setup.sh
# ──────────────────────────────────────────────────────────────

set -e

BRAIN_DIR="/home/ec2-user/arpit-brain-trainer"
SERVICE_NAME="arpit-brain"

echo "🧠 ARPIT BRAIN TRAINER v2.0 — Setup"
echo "═══════════════════════════════════════"

# ─── 1. Install dependencies ──────────────────────────────────
echo ""
echo "📦 Installing dependencies..."
cd "$BRAIN_DIR"
npm install

# ─── 2. Create logs directory ─────────────────────────────────
echo ""
echo "📁 Creating logs directory..."
mkdir -p "$BRAIN_DIR/logs"

# ─── 3. Check .env exists ────────────────────────────────────
if [ ! -f "$BRAIN_DIR/.env" ]; then
    echo ""
    echo "⚠️  No .env file found. Copying from .env.example..."
    cp "$BRAIN_DIR/.env.example" "$BRAIN_DIR/.env"
    echo "   ➡️  Edit $BRAIN_DIR/.env with your credentials!"
fi

# ─── 4. Stop old brain service if running ─────────────────────
echo ""
echo "🔄 Stopping old moneymaker-brain service (if running)..."
sudo systemctl stop moneymaker-brain 2>/dev/null || true
sudo systemctl disable moneymaker-brain 2>/dev/null || true

# ─── 5. Install new systemd service ──────────────────────────
echo ""
echo "⚙️  Installing systemd service..."
sudo cp "$BRAIN_DIR/scripts/arpit-brain.service" /etc/systemd/system/${SERVICE_NAME}.service
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}

# ─── 6. Install watchdog cron ─────────────────────────────────
echo ""
echo "🐕 Installing watchdog cron (every 10 minutes)..."
chmod +x "$BRAIN_DIR/scripts/watchdog-cron.sh"

# Add cron job if not already present
CRON_LINE="*/10 * * * * $BRAIN_DIR/scripts/watchdog-cron.sh"
(crontab -l 2>/dev/null | grep -v "watchdog-cron.sh"; echo "$CRON_LINE") | crontab -

# ─── 7. Start the brain ──────────────────────────────────────
echo ""
echo "🚀 Starting Arpit Brain..."
sudo systemctl start ${SERVICE_NAME}

sleep 3
STATUS=$(systemctl is-active ${SERVICE_NAME})

echo ""
echo "═══════════════════════════════════════"
if [ "$STATUS" = "active" ]; then
    echo "✅ ARPIT BRAIN v2.0 IS LIVE!"
    echo ""
    echo "   Service: sudo systemctl status $SERVICE_NAME"
    echo "   Logs:    tail -f $BRAIN_DIR/logs/brain.log"
    echo "   API:     http://localhost:3000/health"
    echo "   Bot:     https://t.me/Adarsh_money_maker_bot"
else
    echo "❌ Brain failed to start!"
    echo "   Check: sudo journalctl -u $SERVICE_NAME -n 50"
fi
echo "═══════════════════════════════════════"
