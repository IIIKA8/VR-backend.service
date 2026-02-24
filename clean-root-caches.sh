#!/bin/bash
# Автоматическая очистка логов, кэшей и временных файлов
# Запускается через cron каждые 2 часа

LOG_FILE="/var/log/cleanup.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

log() {
    echo "[$DATE] $1" | tee -a "$LOG_FILE"
}

log "=== Начало очистки ==="

# 1. Очистка кэша Cursor
log "Очистка /root/.cursor-server ..."
rm -rf /root/.cursor-server 2>/dev/null
log "Очистка /root/.cursor ..."
rm -rf /root/.cursor 2>/dev/null

# 2. Очистка npm кэша
log "Очистка /root/.npm ..."
rm -rf /root/.npm 2>/dev/null

# 3. Очистка других кэшей
log "Очистка /root/.cache ..."
rm -rf /root/.cache 2>/dev/null

# 4. Ротация логов MongoDB (если размер больше 50MB)
MONGODB_LOG_SIZE=$(du -sm /var/log/mongodb/mongod.log 2>/dev/null | cut -f1)
if [ "$MONGODB_LOG_SIZE" -gt 50 ]; then
    log "Логи MongoDB превышают 50MB (${MONGODB_LOG_SIZE}MB), выполняю ротацию..."
    logrotate -f /etc/logrotate.d/mongodb 2>&1 | tee -a "$LOG_FILE"
    
    # Удаляем старые логи (оставляем только последние 3 файла)
    cd /var/log/mongodb 2>/dev/null && \
    ls -t mongod.log* 2>/dev/null | tail -n +4 | xargs rm -f 2>/dev/null
    log "Ротация логов MongoDB завершена"
fi

# 5. Очистка старых системных логов (оставляем только последние 2 дня)
log "Очистка старых системных логов (journalctl)..."
journalctl --vacuum-time=2d 2>&1 | grep -i "freed\|vacuum" | tee -a "$LOG_FILE"

# 6. Очистка старых ротированных системных логов
log "Очистка старых ротированных логов..."
rm -f /var/log/syslog.* 2>/dev/null
rm -f /var/log/auth.log.* 2>/dev/null
rm -f /var/log/ufw.log.* 2>/dev/null
rm -f /var/log/kern.log.* 2>/dev/null

# 7. Очистка btmp (логи неудачных входов) если больше 10MB
BTMP_SIZE=$(du -sm /var/log/btmp 2>/dev/null | cut -f1)
if [ "$BTMP_SIZE" -gt 10 ]; then
    log "Очистка /var/log/btmp (${BTMP_SIZE}MB)..."
    truncate -s 0 /var/log/btmp 2>/dev/null
fi

# 8. Очистка старых логов приложения
log "Очистка старых логов приложения..."
cd /var/www/vr-backend 2>/dev/null && \
rm -f server.log.* *.log.old 2>/dev/null

# 9. Статистика после очистки
log "=== Статистика после очистки ==="
log "Размер /root: $(du -sh /root 2>/dev/null | cut -f1)"
log "Размер /var/log/mongodb: $(du -sh /var/log/mongodb 2>/dev/null | cut -f1)"
log "Размер /var/log: $(du -sh /var/log 2>/dev/null | cut -f1)"
log "Свободное место: $(df -h / | tail -1 | awk '{print $4}')"

log "=== Очистка завершена ===" 