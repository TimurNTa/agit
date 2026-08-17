#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="agit.volochek69.ru"
REPO="https://github.com/TimurNTa/agit.git"
APP_DIR="/var/www/agit"
PHOTO_DIR="/var/lib/agit/photos"
SERVICE="agit"
PORT="3310"
OKRUG_MAP_SOURCE="/var/www/volochek69-online/frontend/src/components/map"

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

if [[ -d "$OKRUG_MAP_SOURCE" ]]; then
  mkdir -p "$APP_DIR/reference"
  rm -rf "$APP_DIR/reference/okrug-map"
  cp -a "$OKRUG_MAP_SOURCE" "$APP_DIR/reference/okrug-map"
  echo "Снимок карты Округ Онлайн: $APP_DIR/reference/okrug-map"
fi

ENV_FILE="$APP_DIR/.env"
FIRST_INSTALL=0
if [[ ! -f "$ENV_FILE" ]]; then
  FIRST_INSTALL=1
  SESSION_SECRET="$(openssl rand -hex 48)"
  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
APP_URL=https://$DOMAIN
DATABASE_URL=
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
fi

# Всегда синхронизируем пароль роли и DATABASE_URL. Это делает повторный запуск
# самовосстанавливающимся после неудачной первичной установки или ручной смены роли.
DB_PASS="$(openssl rand -hex 24)"
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='agit'" | grep -q 1; then
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "CREATE ROLE agit LOGIN PASSWORD '$DB_PASS';"
else
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "ALTER ROLE agit WITH LOGIN PASSWORD '$DB_PASS';"
fi
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='agit'" | grep -q 1; then
  runuser -u postgres -- createdb -O agit agit
else
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "ALTER DATABASE agit OWNER TO agit;"
fi

NEW_DB_URL="postgresql://agit:${DB_PASS}@127.0.0.1:5432/agit"
if grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=${NEW_DB_URL}#" "$ENV_FILE"
else
  printf '\nDATABASE_URL=%s\n' "$NEW_DB_URL" >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

if ! PGPASSWORD="$DB_PASS" psql -h 127.0.0.1 -p 5432 -U agit -d agit -tAc 'SELECT 1' | grep -q 1; then
  echo >&2
  echo "Ошибка: локальный PostgreSQL не принимает созданные credentials по 127.0.0.1:5432." >&2
  echo "Диагностика PostgreSQL:" >&2
  pg_lsclusters 2>/dev/null || true
  ss -lntp 2>/dev/null | grep ':5432' || true
  exit 1
fi
echo "PostgreSQL: TCP-аутентификация agit подтверждена."

if [[ "$FIRST_INSTALL" -eq 1 ]]; then
  echo
  echo "Создан $ENV_FILE. После сборки заполни VK_GROUP_TOKEN, VK_CALLBACK_SECRET, VK_CONFIRMATION_TOKEN и замени ADMIN_PASSWORD."
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
if [[ -d "$APP_DIR/reference/okrug-map" ]]; then
  echo "Карта Округ Онлайн (reference): $APP_DIR/reference/okrug-map"
fi
echo "Статус: systemctl status $SERVICE --no-pager"
echo "========================================"
