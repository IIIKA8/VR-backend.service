# Чистка временных и кэш-файлов npm и system cache для пользователя root

echo "[INFO] Очистка /root/.cursor-server ..."
rm -rf /root/.cursor-server

echo "[INFO] Очистка /root/.npm ..."
rm -rf /root/.npm

echo "[INFO] Очистка /root/.cache ..."
rm -rf /root/.cache

echo "[INFO] Проверка занятого места в /root:"
du -sh /root

echo "[INFO] Свободное место на диске:"
df -h /

echo "[DONE] Очистка завершена" 