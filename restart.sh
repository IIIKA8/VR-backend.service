#!/bin/bash
# restart.sh - Перезапуск VR Backend

echo "🔄 Перезапуск VR Backend..."

cd /var/www/vr-backend

# Проверяем, запущен ли systemd сервис
if systemctl is-active --quiet vr-backend; then
    echo "📦 Перезапуск через systemd..."
    sudo systemctl restart vr-backend
    sleep 2
    sudo systemctl status vr-backend --no-pager
else
    echo "📦 Перезапуск вручную..."
    
    # Убиваем старый процесс
    pkill -f "node.*server.js" || true
    sleep 1
    
    # Запускаем новый процесс в фоне
    nohup node server.js > server.log 2>&1 &
    
    echo "✅ Сервер запущен (PID: $!)"
    echo "📋 Логи: tail -f server.log"
fi

echo "✨ Готово!"
