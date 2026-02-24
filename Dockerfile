# VR Backend — образ для запуска приложения в контейнере
# Сборка: docker build -t vr-backend .
# Запуск: см. docker-compose.yml или README-DOCKER.md

FROM node:20-alpine

# Запуск не от root (безопасность)
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app

# Копируем только файлы зависимостей для кэширования слоёв
COPY package.json package-lock.json* ./

# Устанавливаем зависимости (без dev для меньшего образа)
RUN npm ci --omit=dev && npm cache clean --force

# Копируем исходный код приложения
COPY --chown=appuser:appgroup . .

USER appuser

# Порт приложения (Express + WebSocket)
EXPOSE 8080

# Проверка здоровья (опционально для оркестрации)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://localhost:8080/api/health || exit 1

# Запуск сервера
CMD ["node", "server.js"]
