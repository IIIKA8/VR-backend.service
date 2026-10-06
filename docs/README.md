# Документация VR Backend

Серверная информационная система управления VR-сеансами: Node.js, Express 5, MongoDB (Mongoose), сессии, REST API и веб-кабинеты (администратор, врач, пациент).

Документация формируется из комментариев **JSDoc** в исходном коде:

```bash
npm install
npm run docs
```

Результат: каталог `docs/generated/` (откройте `index.html` в браузере).



---

## Структура проекта

```
VR-backend.service/
├── server.js              # Точка входа, middleware, монтирование API
├── routes/                # REST-маршруты по доменам
│   ├── auth.js            # Регистрация, вход, сессия
│   ├── users.js           # CRUD пользователей
│   ├── devices.js         # VR-устройства
│   ├── sessions.js        # VR-сеансы
│   ├── scenes.js          # Сцены
│   ├── licenses.js        # Лицензии и доступ
│   ├── usagePeriods.js    # Периоды использования
│   ├── doctor.js          # API кабинета врача
│   ├── patient.js         # API кабинета пациента
│   └── vr.js              # Результаты упражнений (VR-клиент)
├── models/                # Схемы Mongoose (8 коллекций)
├── util/                  # Валидация, URI MongoDB, аналитика
├── web/                   # Статика и HTML кабинетов
├── __tests__/             # Jest (модульные тесты)
├── docs/                  # JSDoc-документация
├── docker-compose.yml     # Локальный запуск app + MongoDB
└── deploy/                # Compose и .env для запуска из Docker-образа
```

---

## Переменные окружения

| Переменная | Обязательность | Описание |
|------------|----------------|----------|
| `PORT` | нет (8080) | Порт на хосте при `docker compose` |
| `SESS_SECRET` | да (прод) | Секрет подписи cookie сессии (≥ 32 символов) |
| `LICENSE_PURGE_PASSWORD` | для purge | Пароль удаления лицензий в админке (не коммитить) |
| `MONGO_USER` | да (Docker) | Пользователь MongoDB |
| `MONGO_PASSWORD` | да (Docker) | Пароль MongoDB |
| `NODE_ENV` | нет | `development` \| `production` |
| `MONGODB_URI` | нет | Полный URI (иначе собирается из `MONGO_*`) |
| `MONGO_HOST` | нет | Хост БД в Docker: `mongodb` |
| `MONGO_DB` | нет | Имя БД: `vr-app` |
| `MONGODB_PORT` | нет | Порт Mongo на localhost (27017) |
| `SERVER_IP` | нет | Адрес bind (в контейнере `0.0.0.0`) |
| `TRUST_PROXY` | нет | `1` за reverse proxy (Nginx) |

Пример: файл `.env.example` в корне репозитория.

---

## Спецификация REST API (префиксы)

Базовый URL: `http://<host>:8080`

| Префикс | Модуль | Назначение |
|---------|--------|------------|
| `/api/health`, `/health` | server | Проверка работоспособности |
| `/api/auth` | routes/auth | Регистрация, вход, статус сессии |
| `/api/users` | routes/users | Пользователи |
| `/api/devices` | routes/devices | Устройства VR |
| `/api/sessions` | routes/sessions | Сеансы |
| `/api/scenes` | routes/scenes | Сцены |
| `/api/licenses` | routes/licenses | Лицензии |
| `/api/usage-periods` | routes/usagePeriods | Периоды доступа |
| `/api/vr` | routes/vr | Режимы и результаты упражнений |
| `/api/doctor` | routes/doctor | Кабинет врача (guard) |
| `/api/patient` | routes/patient | Кабинет пациента (guard) |
| `/api/admin` | server | Админ API (adminGuard) |

Подробные параметры запросов и ответов — в JSDoc соответствующих модулей (`routes/*`).

---

## Развёртывание в Docker

**Локально** (из корня репозитория):

```bash
cp .env.example .env
# задайте MONGO_USER, MONGO_PASSWORD, SESS_SECRET
docker compose up -d
curl -s http://127.0.0.1:8080/api/health
```

**Запуск из готового Docker-образа:** см. `deploy/README.md`.

Проверка контейнера: healthcheck по `GET /api/health` (интервал 30 с).

---

## Связанные материалы

| Документ | Содержание |
|----------|------------|
| `README.md` | Обзор и быстрый старт |
| `deploy/README.md` | Запуск из готового Docker-образа |
| `npm test` | Модульные тесты Jest |
