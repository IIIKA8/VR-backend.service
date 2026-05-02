#!/usr/bin/env sh
# Запуск на сервере из каталога deploy (рядом с docker-compose.yml и .env):
#   chmod +x update.sh && ./update.sh

set -e
cd "$(dirname "$0")"
docker compose pull
docker compose up -d
echo "---"
docker compose ps
