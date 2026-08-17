#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="agit.volochek69.ru"
REPO="https://github.com/TimurNTa/agit.git"
APP_DIR="/var/www/agit"
PHOTO_DIR="/var/lib/agit/photos"
SERVICE="agit"
PORT="3310"

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Запусти команду от root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git nginx postgresql postgresql-client openssl ca-certificates certbot python3-certbot-nginx >/dev/null

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. На этом сервере нужен Node.js 22.12+ или 24 LTS." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
if (( NODE_MAJOR < 22 || (NODE_MAJOR == 22 && NODE_MINOR < 12) )); then
  echo "Текущий Node.js: $(node -v). Нужен 22.12+; рекомендуется 24 LTS." >&2
  exit 1
fi

mkdir -p "$(dirname "$APP_DIR")" "$PHOTO_DIR"
chmod 750 "$PHOTO_DIR"
chown www-data:www-data "$PHOTO_DIR"

if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch origin main
  git -C "$APP_DIR" reset --hard origin/main
else
  rm -rf "$APP_DIR"
  git clone --depth 1 "$REPO" "$APP_DIR"
fi

ENV_FILE="$APP_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  DB_PASS="$(openssl rand -hex 24)"
  SESSION_SECRET="$(openssl rand -hex 48)"
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='agit'" | grep -q 1; then
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE agit LOGIN PASSWORD '$DB_PASS';"
  else
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE agit WITH PASSWORD '$DB_PASS';"
  fi
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='agit'" | grep -q 1; then
    sudo -u postgres createdb -O agit agit
  fi
  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
APP_URL=https://$DOMAIN
DATABASE_URL=postgresql://agit:$DB_PASS@127.0.0.1:5432/agit
PHOTO_STORAGE_ROOT=$PHOTO_DIR
MAX_REPORT_DISTANCE_METERS=150
VK_API_VERSION=5.199
VK_GROUP_ID=240908156
VK_GROUP_TOKEN=
VK_CALLBACK_SECRET=
VK_CONFIRMATION_TOKEN=
VK_MESSAGES_URL=https://vk.com/im?sel=-240908156
ADMIN_PASSWORD=CHANGE_ME_NOW
SESSION_SECRET=$SESSION_SECRET
ENV
  chmod 600 "$ENV_FILE"
  echo
  echo "Создан $ENV_FILE. Перед запуском VK Callback заполни VK_GROUP_TOKEN, VK_CALLBACK_SECRET, VK_CONFIRMATION_TOKEN и замени ADMIN_PASSWORD."
fi

cd "$APP_DIR"
npm install --no-audit --no-fund
npm run db:generate
npm run db:migrate
npm run build

cat > /etc/systemd/system/${SERVICE}.service <<UNIT
[Unit]
Description=AGIT field reporting app
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PATH=/usr/local/bin:/usr/bin:/bin
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v npm) start
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=$PHOTO_DIR

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/nginx/sites-available/agit <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
NGINX
ln -sfn /etc/nginx/sites-available/agit /etc/nginx/sites-enabled/agit
nginx -t
systemctl daemon-reload
systemctl enable --now "$SERVICE"
systemctl reload nginx

if getent ahostsv4 "$DOMAIN" >/dev/null 2>&1; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || true
fi

echo
echo "========================================"
echo "AGIT развёрнут"
echo "Сайт: https://$DOMAIN"
echo "Админка: https://$DOMAIN/admin"
echo "VK Callback: https://$DOMAIN/api/vk/callback"
echo "ENV: $ENV_FILE"
echo "Фото: $PHOTO_DIR"
echo "Статус: systemctl status $SERVICE --no-pager"
echo "========================================"
