#!/bin/bash
# install.sh - Полная установка окружения для VR Backend

set -e  # Остановка при ошибке

echo "📦 Установка Node.js и npm..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo "📦 Установка MongoDB..."
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org

echo "🚀 Запуск MongoDB..."
sudo systemctl start mongod
sudo systemctl enable mongod

echo "📦 Установка зависимостей проекта..."
cd /var/www/vr-backend
npm install

echo "✅ Установка завершена!"
echo ""
echo "Проверка установки:"
node --version
npm --version
mongosh --version
echo ""
echo "Для запуска сервера выполните:"
echo "  cd /var/www/vr-backend"
echo "  node server.js"
