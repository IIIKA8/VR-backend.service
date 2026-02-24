# Развёртывание из образа Docker (без исходного кода)

На новом сервере нужны только Docker, Docker Compose и эти два файла.

## 1. Создайте папку и файлы

```bash
mkdir -p /opt/vr-backend && cd /opt/vr-backend
```

Скопируйте сюда `docker-compose.yml` и создайте `.env`:

```bash
cp .env.example .env
nano .env   # задайте DOCKER_IMAGE и SESS_SECRET
```

## 2. Заполните .env

- **DOCKER_IMAGE** — образ с Docker Hub, например `myuser/vr-backend:latest`
- **SESS_SECRET** — случайная строка для сессий (не меньше 32 символов)

## 3. Запуск

```bash
docker compose up -d
```

Проверка: `curl http://localhost:8080/api/health`

Дашборд: http://IP_СЕРВЕРА:8080

## Откуда взять образ

Образ публикует владелец проекта (см. основной README-DOCKER.md, раздел «Публикация образа»). Либо используйте свой: соберите из исходников, запушьте в Docker Hub и укажите свой `DOCKER_IMAGE` в `.env`.
