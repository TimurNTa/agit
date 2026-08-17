#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/var/www/agit"
ENV_FILE="$APP_DIR/.env"

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Запусти от root." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Не найден $ENV_FILE. Сначала разверни AGIT." >&2
  exit 1
fi

prompt_secret() {
  local label="$1"
  local var_name="$2"
  local value=""
  while [[ -z "$value" ]]; do
    read -r -s -p "$label: " value
    echo
    if [[ -z "$value" ]]; then
      echo "Значение не может быть пустым."
    fi
  done
  printf -v "$var_name" '%s' "$value"
}

prompt_secret "VK group access token" VK_GROUP_TOKEN_VALUE
prompt_secret "VK Callback secret" VK_CALLBACK_SECRET_VALUE
prompt_secret "VK confirmation code" VK_CONFIRMATION_TOKEN_VALUE

while true; do
  prompt_secret "Новый пароль админки AGIT (минимум 12 символов)" ADMIN_PASSWORD_VALUE
  if (( ${#ADMIN_PASSWORD_VALUE} < 12 )); then
    echo "Пароль слишком короткий. Нужно минимум 12 символов."
    ADMIN_PASSWORD_VALUE=""
    continue
  fi
  read -r -s -p "Повтори пароль админки: " ADMIN_PASSWORD_CONFIRM
  echo
  if [[ "$ADMIN_PASSWORD_VALUE" != "$ADMIN_PASSWORD_CONFIRM" ]]; then
    echo "Пароли не совпадают. Повтори."
    ADMIN_PASSWORD_VALUE=""
    ADMIN_PASSWORD_CONFIRM=""
    continue
  fi
  break
done

export VK_GROUP_TOKEN_VALUE VK_CALLBACK_SECRET_VALUE VK_CONFIRMATION_TOKEN_VALUE ADMIN_PASSWORD_VALUE
python3 - "$ENV_FILE" <<'PY'
import os
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
updates = {
    "VK_GROUP_TOKEN": os.environ["VK_GROUP_TOKEN_VALUE"],
    "VK_CALLBACK_SECRET": os.environ["VK_CALLBACK_SECRET_VALUE"],
    "VK_CONFIRMATION_TOKEN": os.environ["VK_CONFIRMATION_TOKEN_VALUE"],
    "ADMIN_PASSWORD": os.environ["ADMIN_PASSWORD_VALUE"],
}

lines = text.splitlines()
seen = set()
out = []
for line in lines:
    key = line.split("=", 1)[0] if "=" in line else None
    if key in updates:
        out.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        out.append(line)
for key, value in updates.items():
    if key not in seen:
        out.append(f"{key}={value}")
path.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
PY
chmod 600 "$ENV_FILE"

unset VK_GROUP_TOKEN_VALUE VK_CALLBACK_SECRET_VALUE VK_CONFIRMATION_TOKEN_VALUE ADMIN_PASSWORD_VALUE ADMIN_PASSWORD_CONFIRM

systemctl restart agit
sleep 2

echo
echo "Проверка сервиса:"
systemctl --no-pager --full is-active agit

if curl -fsS --max-time 10 https://agit.volochek69.ru/api/health; then
  echo
  echo "AGIT отвечает по HTTPS."
else
  echo
  echo "Health-check не прошёл. Диагностика:" >&2
  systemctl status agit --no-pager -l >&2 || true
  journalctl -u agit -n 80 --no-pager >&2 || true
  exit 1
fi

echo
echo "Секреты сохранены только в $ENV_FILE (chmod 600)."
echo "Теперь укажи Callback URL: https://agit.volochek69.ru/api/vk/callback"
echo "И нажми «Подтвердить» в настройках Callback API сообщества VK."
