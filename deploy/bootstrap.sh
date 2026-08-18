#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="agit.volochek69.ru"
REPO="https://github.com/TimurNTa/agit.git"
APP_DIR="/var/www/agit"
PHOTO_DIR="/var/lib/agit/photos"
SERVICE="agit"
PORT="3310"
OKRUG_MAP_SOURCE="/var/www/volochek69-online/frontend/src/components/map"
OKRUG_MAP_REFERENCE="/var/lib/agit/reference/okrug-map"

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

mkdir -p "$(dirname "$APP_DIR")" "$PHOTO_DIR" "$(dirname "$OKRUG_MAP_REFERENCE")"
chmod 750 "$PHOTO_DIR"
chown www-data:www-data "$PHOTO_DIR"

if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch origin main
  git -C "$APP_DIR" reset --hard origin/main
else
  rm -rf "$APP_DIR"
  git clone --depth 1 "$REPO" "$APP_DIR"
fi

rm -rf "$APP_DIR/reference"
if [[ -d "$OKRUG_MAP_SOURCE" ]]; then
  rm -rf "$OKRUG_MAP_REFERENCE"
  mkdir -p "$(dirname "$OKRUG_MAP_REFERENCE")"
  cp -a "$OKRUG_MAP_SOURCE" "$OKRUG_MAP_REFERENCE"
  echo "Снимок карты Округ Онлайн: $OKRUG_MAP_REFERENCE"
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
OVERPASS_URL=https://overpass-api.de/api/interpreter
NOMINATIM_URL=https://nominatim.openstreetmap.org
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

PG_PORT="$(pg_lsclusters --no-header 2>/dev/null | awk '$4 == "online" { print $3; exit }')"
if [[ -z "$PG_PORT" ]]; then
  echo "Ошибка: не найден online-кластер системного PostgreSQL." >&2
  pg_lsclusters 2>/dev/null || true
  exit 1
fi
echo "PostgreSQL: системный кластер обнаружен на порту $PG_PORT."

# Пароль базы создаётся один раз. На следующих деплоях сохраняем его,
# чтобы уже запущенное приложение и новый .env никогда не расходились.
EXISTING_DB_URL="$(grep '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
DB_PASS=""
if [[ "$EXISTING_DB_URL" =~ ^postgresql://agit:([A-Za-z0-9]+)@127\.0\.0\.1:[0-9]+/agit$ ]]; then
  DB_PASS="${BASH_REMATCH[1]}"
fi
if [[ -z "$DB_PASS" ]]; then
  DB_PASS="$(openssl rand -hex 24)"
fi

if ! runuser -u postgres -- psql -p "$PG_PORT" -tAc "SELECT 1 FROM pg_roles WHERE rolname='agit'" | grep -q 1; then
  runuser -u postgres -- psql -p "$PG_PORT" -v ON_ERROR_STOP=1 -c "CREATE ROLE agit LOGIN PASSWORD '$DB_PASS';"
else
  runuser -u postgres -- psql -p "$PG_PORT" -v ON_ERROR_STOP=1 -c "ALTER ROLE agit WITH LOGIN PASSWORD '$DB_PASS';"
fi
if ! runuser -u postgres -- psql -p "$PG_PORT" -tAc "SELECT 1 FROM pg_database WHERE datname='agit'" | grep -q 1; then
  runuser -u postgres -- createdb -p "$PG_PORT" -O agit agit
else
  runuser -u postgres -- psql -p "$PG_PORT" -v ON_ERROR_STOP=1 -c "ALTER DATABASE agit OWNER TO agit;"
fi

NEW_DB_URL="postgresql://agit:${DB_PASS}@127.0.0.1:${PG_PORT}/agit"
if grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=${NEW_DB_URL}#" "$ENV_FILE"
else
  printf '\nDATABASE_URL=%s\n' "$NEW_DB_URL" >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

if ! PGPASSWORD="$DB_PASS" psql -h 127.0.0.1 -p "$PG_PORT" -U agit -d agit -tAc 'SELECT 1' | grep -q 1; then
  echo >&2
  echo "Ошибка: системный PostgreSQL не принимает credentials по 127.0.0.1:${PG_PORT}." >&2
  pg_lsclusters 2>/dev/null || true
  ss -lntp 2>/dev/null | grep ":${PG_PORT}" || true
  exit 1
fi
echo "PostgreSQL: TCP-аутентификация agit подтверждена на порту $PG_PORT."

if [[ "$FIRST_INSTALL" -eq 1 ]]; then
  echo
  echo "Создан $ENV_FILE. После сборки заполни VK_GROUP_TOKEN, VK_CALLBACK_SECRET, VK_CONFIRMATION_TOKEN и замени ADMIN_PASSWORD."
fi

cd "$APP_DIR"
npm ci --no-audit --no-fund
npm run db:generate
npm run db:migrate
npm run typecheck
npm run test:unit
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
systemctl enable "$SERVICE" >/dev/null
# Важно: именно restart, а не enable --now. Так процесс всегда перечитывает
# новый код и EnvironmentFile после каждого деплоя.
systemctl restart "$SERVICE"
systemctl reload nginx

sleep 2
if ! curl -fsS --max-time 10 "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
  echo "Ошибка: AGIT не прошёл локальный health-check после перезапуска." >&2
  systemctl status "$SERVICE" --no-pager -l >&2 || true
  journalctl -u "$SERVICE" -n 80 --no-pager >&2 || true
  exit 1
fi
echo "AGIT: сервис перезапущен, health-check успешен."

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
echo "PostgreSQL: 127.0.0.1:$PG_PORT"
if [[ -d "$OKRUG_MAP_REFERENCE" ]]; then
  echo "Карта Округ Онлайн (reference): $OKRUG_MAP_REFERENCE"
fi
echo "Статус: systemctl status $SERVICE --no-pager"
echo "========================================"
