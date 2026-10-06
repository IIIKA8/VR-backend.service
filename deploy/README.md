# Деплой через готовый Docker-образ

Папка `deploy/` предназначена для запуска приложения на сервере без копирования исходников.

## Файлы

- `docker-compose.yml` — запуск приложения и MongoDB
- `.env.example` — пример переменных окружения
- `update.sh` — обновление контейнеров

## Настройка

```bash
cp .env.example .env
nano .env
```

Обязательно заполните:

```env
DOCKER_IMAGE=адрес_вашего_docker_образа
SESS_SECRET=длинная_случайная_строка
LICENSE_PURGE_PASSWORD=отдельный_пароль_для_purge_лицензий
MONGO_USER=admin
MONGO_PASSWORD=надёжный_пароль
```

## Запуск

```bash
docker compose up -d
```

Проверка:

```bash
curl http://127.0.0.1:8080/api/health
docker compose logs -f app
```

## Обновление

```bash
docker compose pull
docker compose up -d
```

или:

```bash
chmod +x update.sh
./update.sh
```

## MongoDB

MongoDB публикуется только на `127.0.0.1`, чтобы порт `27017` не был доступен из интернета.

Для подключения с локального ПК используйте SSH-туннель или выполняйте администрирование на сервере.
