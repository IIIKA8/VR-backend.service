# Запуск VR Backend в Docker

Краткая инструкция по развёртыванию и переносу приложения с помощью Docker.

## Требования

- Docker и Docker Compose (v2+)
- На другом сервере достаточно скопировать проект и выполнить команды ниже

## Быстрый старт

```bash
# 1. Переменные окружения (опционально)
cp .env.example .env
# Отредактируйте .env: задайте SESS_SECRET и при необходимости PORT

# 2. Запуск приложения и MongoDB
docker compose up -d

# 3. Проверка
curl http://localhost:8080/api/health
```

- **Дашборд:** http://localhost:8080  
- **API:** http://localhost:8080/api  
- **WebSocket:** ws://localhost:8080  

## Тесты и документация (Jest / JSDoc)

```bash
npm install
npm test          # модульные тесты
npm run docs      # HTML из JSDoc → docs/generated/index.html
```

Подробнее: `docs/README.md` (структура проекта, API, переменные окружения).

## Адреса и новая машина

**Ничего подстраивать вручную не нужно.** Все запросы идут относительно того адреса, с которого открыта страница:

- Вы открываете дашборд по `http://IP_НОВОГО_СЕРВЕРА:8080` (или по домену) — API и WebSocket автоматически используют этот же хост и порт.
- В коде нет зашитых IP: фронт использует относительные пути (`/api`, `/static`) и `window.location` для WebSocket.
- На бэкенде порт и бинд задаются через `PORT` и `SERVER_IP` (в Docker уже стоят под контейнер). MongoDB в Docker подключается по имени сервиса `mongodb`, а не по IP.

Если приложение стоит за reverse proxy (Nginx, Traefik) на новой машине, задайте `TRUST_PROXY=1`, чтобы логи и сессии видели реальный IP и Host.

## Публикация образа и развёртывание без исходников

Чтобы на новом сервере **не клонировать репозиторий**, а только скачать образ с Docker Hub:

### 1. Один раз: собрать и опубликовать образ (на машине с исходниками)

```bash
# Регистрация на https://hub.docker.com и вход
docker login

# Сборка образа (пример: leshien/vr-backend-web-app)
docker build -t leshien/vr-backend-web-app:latest .

# Публикация на Docker Hub
docker push leshien/vr-backend-web-app:latest
```

### 2. На новом сервере: развернуть только из образа

Исходный код не нужен. Нужны только Docker, Docker Compose и два файла из папки **deploy/** этого репозитория:

- `deploy/docker-compose.yml`
- `deploy/.env.example` → скопировать в `.env` и заполнить

**Вариант А — скопировать только папку deploy:**

```bash
# На новом сервере (или скачайте deploy/ с GitHub вручную)
mkdir -p /opt/vr-backend && cd /opt/vr-backend
# Вставьте сюда содержимое deploy/docker-compose.yml в файл docker-compose.yml
# Создайте .env из deploy/.env.example

# В .env задайте:
# DOCKER_IMAGE=leshien/vr-backend-web-app:latest
# SESS_SECRET=ваш-секрет-не-короче-32-символов

docker compose up -d
```

**Вариант Б — клонировать репозиторий только ради deploy:**

```bash
git clone https://github.com/ВАШ_ЛОГИН/vr-backend.git
cd vr-backend/deploy
cp .env.example .env
# Отредактируйте .env: DOCKER_IMAGE и SESS_SECRET
docker compose up -d
```

После `docker compose up -d` образ приложения и MongoDB скачаются с Docker Hub, контейнеры запустятся. Дашборд: `http://IP_СЕРВЕРА:8080`.

---

## Перенос на другой сервер

1. Скопируйте на новый сервер:
   - весь каталог проекта (исходники), **или**
   - только `Dockerfile`, `docker-compose.yml`, `.env.example`, `package.json`, `package-lock.json`, папки `models/`, `routes/`, `web/`, `util/` и файл `server.js` (и остальные корневые .js при необходимости).

2. На новом сервере:
   ```bash
   cd /path/to/vr-backend
   cp .env.example .env
   # при необходимости отредактируйте .env
   docker compose up -d
   ```

Данные MongoDB хранятся в Docker-томе `mongodb_data`. При переносе с сохранением данных см. раздел «Тома и данные».

## Масштабирование и ресурсы

- **Больше инстансов приложения:** за подгрузкой и сессиями обычно ставят один MongoDB и несколько реплик `app` за балансировщиком (nginx/traefik). В текущем `docker-compose` один контейнер `app`; для нескольких реплик нужно вынести MongoDB и задать общий `MONGODB_URI` и хранилище сессий (например Redis), затем масштабировать: `docker compose up -d --scale app=3` (после настройки балансировщика и сессий).

- **Ограничение ресурсов** в `docker-compose.yml`:
  ```yaml
  app:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          memory: 256M
  mongodb:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G
  ```

- **Порт на хосте:** в `.env` задайте `PORT=8080` (или другой). Сборка образа: `docker compose build`, перезапуск: `docker compose up -d`.

## Полезные команды

```bash
# Логи приложения
docker compose logs -f app

# Логи MongoDB
docker compose logs -f mongodb

# Остановка
docker compose down

# Остановка с удалением тома с данными MongoDB
docker compose down -v
```

## Тома и данные

- `mongodb_data` — данные MongoDB. Без `docker compose down -v` том сохраняется при перезапуске и переносе (см. документацию Docker по экспорту/импорту volumes).

## Запуск только приложения (MongoDB снаружи)

Если MongoDB уже запущена отдельно:

```bash
docker run --rm -p 8080:8080 \
  -e MONGODB_URI=mongodb://host.docker.internal:27017/vr-app \
  -e SESS_SECRET=your-secret \
  vr-backend:latest
```

Предварительно соберите образ: `docker build -t vr-backend:latest .`

## Healthcheck

В образе включён healthcheck по адресу `/api/health`. Его используют Docker и оркестраторы (Kubernetes, Swarm) для проверки готовности контейнера.
