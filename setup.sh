#!/usr/bin/env bash

# Colors
Color_Off='\033[0m'
Red='\033[0;31m'
Green='\033[0;32m'
Yellow='\033[0;33m'

# Constants
GITHUB_REPO_URL="https://github.com/actchanthar/mytel.git"  # Your repo
NODE_PORT=3000  # Internal port for Node.js (Nginx proxies to this)
SERVER_PORT=443  # External port (TLS)
DOMAIN="actanimemm.eu.org"  # Your domain
UUID="a10d76fd-25ec-4d5a-bdf1-6593a73e2e16"  # Default UUID
EMAIL="layp75486@gmail.com"  # Replace with your actual email for Certbot

OK="${Green}[OK]"
ERROR="${Red}[ERROR]"
INFO="${Yellow}[INFO]"

# Print functions
print_ok() { echo -e "${OK} $1 ${Color_Off}"; }
print_error() { echo -e "${ERROR} $1 ${Color_Off}"; }
print_info() { echo -e "${INFO} $1 ${Color_Off}"; }

# Check root
if [[ "$EUID" -ne 0 ]]; then
    print_error "Run as root!"
    exit 1
fi

# Check OS (Ubuntu only)
if ! grep -qs "ubuntu" /etc/os-release; then
    print_error "This script is for Ubuntu only!"
    exit 1
fi

# Disable firewalls temporarily
print_info "Disabling firewalls..."
systemctl stop ufw firewalld nftables >/dev/null 2>&1
systemctl disable ufw firewalld nftables >/dev/null 2>&1
print_ok "Firewalls disabled"

# Install dependencies
print_info "Installing dependencies..."
apt update && apt upgrade -y
apt install -y git curl unzip nginx certbot python3-certbot-nginx socat net-tools >/dev/null 2>&1
print_ok "Dependencies installed"

# Install Node.js (v20)
print_info "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
print_ok "Node.js installed"

# Clone GitHub repo
print_info "Cloning GitHub repo..."
if ! git clone $GITHUB_REPO_URL /root/vless-vps; then
    print_error "Git clone failed! Check repo URL."
    exit 1
fi
cd /root/vless-vps
print_ok "Repo cloned"

# Install npm packages
print_info "Installing npm packages..."
npm install ws >/dev/null 2>&1
print_ok "Packages installed"

# Configure Nginx for reverse proxy with TLS
print_info "Configuring Nginx..."
cat << EOF > /etc/nginx/sites-available/default
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:$NODE_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }
}
EOF
systemctl restart nginx
print_ok "Nginx configured (HTTP)"

# Get TLS cert (non-interactive)
print_info "Getting TLS certificate..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --no-eff-email --email $EMAIL --preferred-challenges http
print_ok "TLS enabled (now on port 443)"

# Set up as service (using systemd)
print_info "Setting up as systemd service..."
cat << EOF > /etc/systemd/system/vless.service
[Unit]
Description=VLESS Proxy Server
After=network.target

[Service]
ExecStart=/usr/bin/node /root/vless-vps/server.js
Restart=always
User=root
WorkingDirectory=/root/vless-vps

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable vless
systemctl start vless
print_ok "Service started"

# Open firewall ports and re-enable ufw
print_info "Opening ports..."
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 7777:7780/udp  # For PUBG UDP
ufw --force enable
print_ok "Firewall updated"

# Generate and display VLESS key
print_info "Generating VLESS key..."
node -e "console.log('vless://$UUID@$DOMAIN:443?encryption=none&security=tls&type=ws&host=$DOMAIN&sni=$DOMAIN&path=/?ed=2560&headerType=ws&headers=eyJIb3N0IjogImFjdC5hY3RhbmltZW1tLndlYnJlZGlyZWN0Lm9yZyJ9#VLESS-act')"
print_ok "Setup complete! Access https://$DOMAIN/generate-key for new keys. Test in your client."
