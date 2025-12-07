#!/bin/bash
# Скрипт развёртывания VR-Backend на новом сервере через Git
# Использование: sudo bash deploy.sh <GIT_REPO_URL> [BRANCH]

set -e

if [ "$EUID" -ne 0 ]; then 
    echo "❌ Этот скрипт должен запускаться от root (sudo)"
    exit 1
fi

GIT_REPO_URL="$1"
BRANCH="${2:-main}"
PROJECT_DIR="/var/www/vr-backend"
SERVICE_USER="${SUDO_USER:-www-data}"

if [ -z "$GIT_REPO_URL" ]; then
    echo "❌ Укажите URL Git репозитория!"
    echo ""
    echo "Использование:"
    echo "  sudo bash deploy.sh <GIT_REPO_URL> [BRANCH]"
    echo ""
    echo "Примеры:"
    echo "  sudo bash deploy.sh https://github.com/user/vr-backend.git"
    echo "  sudo bash deploy.sh git@github.com:user/vr-backend.git main"
    exit 1
fi

echo "🚀 Развёртывание VR-Backend..."
echo "📦 Репозиторий: $GIT_REPO_URL"
echo "🌿 Ветка: $BRANCH"
echo "📁 Директория: $PROJECT_DIR"
echo ""

# 1. Устанавливаем системные зависимости
echo "🔧 Проверяем системные зависимости..."

# Node.js
if ! command -v node &> /dev/null; then
    echo "📦 Устанавливаем Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "✅ Node.js уже установлен: $(node --version)"
fi

# MongoDB
if ! command -v mongod &> /dev/null; then
    echo "📦 Устанавливаем MongoDB..."
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
    apt-get update
    apt-get install -y mongodb-org
    systemctl enable mongod
    systemctl start mongod
    sleep 3
    echo "✅ MongoDB установлен и запущен"
else
    echo "✅ MongoDB уже установлен"
    systemctl start mongod 2>/dev/null || true
fi

# Git
if ! command -v git &> /dev/null; then
    echo "📦 Устанавливаем Git..."
    apt-get update
    apt-get install -y git
fi

# 2. Клонируем или обновляем репозиторий
if [ -d "$PROJECT_DIR/.git" ]; then
    echo "📥 Обновляем существующий репозиторий..."
    cd "$PROJECT_DIR"
    git fetch origin
    git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
    git pull origin "$BRANCH"
else
    echo "📥 Клонируем репозиторий..."
    if [ -d "$PROJECT_DIR" ]; then
        echo "⚠️  Директория $PROJECT_DIR уже существует, создаём резервную копию..."
        mv "$PROJECT_DIR" "${PROJECT_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    git clone -b "$BRANCH" "$GIT_REPO_URL" "$PROJECT_DIR"
fi

# 3. Устанавливаем npm зависимости
echo "📦 Устанавливаем npm зависимости..."
cd "$PROJECT_DIR"
npm install --production

# 4. Настраиваем .env файл
if [ ! -f .env ]; then
    echo "📝 Создаём .env файл..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✅ .env создан из .env.example"
    else
        cat > .env <<EOF
# MongoDB
MONGODB_URI=mongodb://localhost:27017/vr-app

# Server
PORT=8080
SERVER_IP=0.0.0.0

# Session Secret (сгенерирован автоматически)
SESS_SECRET=$(openssl rand -hex 32)

# Admin Password
ADMIN_PASSWORD=BIM_local123
EOF
        echo "✅ .env создан с настройками по умолчанию"
    fi
    echo ""
    echo "⚠️  ВАЖНО: Отредактируйте .env файл с правильными настройками!"
    echo "   nano $PROJECT_DIR/.env"
else
    echo "✅ .env файл уже существует"
fi

# 5. Устанавливаем права доступа
echo "🔐 Настраиваем права доступа..."
chown -R "$SERVICE_USER:$SERVICE_USER" "$PROJECT_DIR"
chmod +x "$PROJECT_DIR"/*.sh 2>/dev/null || true

# 6. Создаём systemd service
echo "⚙️  Создаём systemd service..."
cat > /etc/systemd/system/vr-backend.service <<EOF
[Unit]
Description=VR Backend Service
After=network.target mongod.service
Requires=mongod.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROJECT_DIR
Environment=NODE_ENV=production
EnvironmentFile=$PROJECT_DIR/.env
ExecStart=/usr/bin/node $PROJECT_DIR/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo "✅ Systemd service создан"

# 7. Финальная информация
echo ""
echo "✅ Развёртывание завершено!"
echo ""
echo "📋 Следующие шаги:"
echo ""
echo "1. Отредактируйте .env файл (если нужно):"
echo "   nano $PROJECT_DIR/.env"
echo ""
echo "2. Запустите сервер:"
echo "   sudo systemctl start vr-backend"
echo "   sudo systemctl enable vr-backend  # автозапуск"
echo ""
echo "3. Проверьте статус:"
echo "   sudo systemctl status vr-backend"
echo ""
echo "4. Проверьте работу API:"
echo "   curl http://localhost:8080/api/health"
echo ""
echo "5. Для обновления в будущем:"
echo "   cd $PROJECT_DIR"
echo "   git pull origin $BRANCH"
echo "   npm install --production"
echo "   sudo systemctl restart vr-backend"
echo ""
```

