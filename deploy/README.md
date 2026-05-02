# Деплой VR Backend на сервер (только Docker, без исходников)

## 1. Образ в GitHub (GHCR)

1. Запушьте код в ветку **`main`** репозитория **VR-backend.service**.
2. Откройте **Actions** → workflow **Publish Docker image** → дождитесь **зелёной** галочки.
3. Убедитесь, что пакет **виден**: **GitHub** → ваш профиль / организация → **Packages** → образ `vr-backend.service` (или как назвался репозиторий).
4. Для **публичного** pull с сервера: в настройках пакета выставьте **Public** (или ниже — вход через `docker login`).

**Точное имя образа** смотрите в логе шага **Build and push** (строка `pushing ...`) или в Packages — обычно:

`ghcr.io/<нижний_регистр_владельца>/<нижний_регистр_репо>:latest`

Пример для репозитория `IIIKA8/VR-backend.service`:

`ghcr.io/iiika8/vr-backend.service:latest`

Если не совпадает — скопируйте из интерфейса GitHub, не угадывайте.

---

## 2. Файлы на сервере

### Что Git реально копирует

`git clone` скачивает **только то, что лежит в репозитории на GitHub** — это не «весь ваш компьютер».

- **Не попадёт на сервер:** `godot/`, `node_modules/`, `.env` и всё, что в **`.gitignore`** — этих папок **нет в репозитории**, Git их не хранит и не клонирует.
- **Попадёт при полном clone:** исходники бэкенда (`server.js`, `routes/`, `web/` …), потому что они **закоммичены**. Если нужно **без лишних каталогов** — вариант **B** (sparse, только `deploy`) или **D** (`scp` только `deploy`).

На VPS для запуска Docker нужны только файлы из **`deploy/`** (`docker-compose.yml`, `.env`), плюс образ тянется из GHCR.

### Варианты загрузки

**A — полный clone, работа из `deploy/`** (на диске будет весь репозиторий):

```bash
git clone https://github.com/IIIKA8/VR-backend.service.git
cd VR-backend.service/deploy
```

**B — только папка `deploy` (sparse checkout, Git ≥ 2.25)** — без остального кода в рабочей папке:

```bash
git clone --filter=blob:none --sparse https://github.com/IIIKA8/VR-backend.service.git vr-app
cd vr-app
git sparse-checkout init --cone
git sparse-checkout set deploy
cd deploy
```

**C — ZIP с GitHub:** **Code → Download ZIP** → на сервере оставьте только папку **`deploy/`** (или распакуйте и перейдите в неё).

**D — только `deploy` с вашего ПК по SSH:**

```bash
scp -r deploy user@ВАШ_IP:/opt/vr-backend/
ssh user@ВАШ_IP
cd /opt/vr-backend
```

### MongoDB и Compass

По умолчанию в compose приложение подключается так: **`mongodb://mongodb:27017/vr-app`** (без логина внутри сети Docker).

С **ПК** в Compass: SSH-туннель на сервер, затем подключение к **`127.0.0.1:27017`**, **без** Authentication (как раньше). Если в томе Mongo уже включали пользователей с паролем, может понадобиться вход — или задайте **`MONGODB_URI`** в `.env` (см. `.env.example`).

---

## 3. Настройка `.env` на сервере

```bash
cd /opt/vr-backend   # или куда положили compose
cp .env.example .env
nano .env
```

Обязательно задайте:

| Переменная        | Описание |
|-------------------|----------|
| `DOCKER_IMAGE`    | Полный URL образа из GHCR (см. шаг 1). |
| `SESS_SECRET`     | Длинная случайная строка (например `openssl rand -hex 32`). |
| `MONGODB_URI`     | Опционально; если не задан — `mongodb://mongodb:27017/vr-app` без пароля. |

Сохраните файл. Файл **`.env` не коммитьте** — он только на сервере.

---

## 4. Запуск и обновление

Из каталога **`deploy/`**, где лежат **`docker-compose.yml`** и **`.env`**:

```bash
docker compose up -d
```

В `docker-compose.yml` для сервиса **`app`** включено **`pull_policy: always`** — при каждом `up` Docker подтянет свежий образ **`latest`** из GHCR (если CI уже собрал новый).

Либо явно:

```bash
docker compose pull && docker compose up -d
```

Скрипт (на Linux-сервере): `chmod +x update.sh && ./update.sh`

Проверка:

```bash
curl -s http://127.0.0.1:8080/api/health
docker compose logs -f app --tail 50
```

---

## 5. Ошибка `unauthorized` при `docker compose pull` (GHCR)

Сообщение вида `Head "https://ghcr.io/.../manifests/latest": unauthorized` значит: пакет в **GitHub Container Registry** **приватный**, и Docker пытается скачать его **без логина**.

**Вариант 1 (проще для одного сервера):** сделать пакет **публичным**

1. GitHub → **Packages** (в профиле или в репозитории) → откройте пакет **`vr-backend.service`**.
2. **Package settings** → **Change package visibility** → **Public** → подтвердить.

После этого снова: `docker compose pull && docker compose up -d`.

**Вариант 2:** оставить пакет приватным — один раз залогиниться на сервере:

```bash
echo ВАШ_GITHUB_TOKEN | docker login ghcr.io -u ВАШ_ЛОГИН_GITHUB --password-stdin
```

Токен: **Settings → Developer settings → Personal access tokens** (classic) — отметьте **`read:packages`**. Логин — тот же, что на GitHub (часто совпадает с владельцем репозитория).

Проверка: `docker pull ghcr.io/iiika8/vr-backend.service:latest` (подставьте точный путь из **Packages**).

---

## 6. Обновление после новых коммитов

На машине разработки: `git push` в `main` → дождаться **Actions** → на сервере:

```bash
cd /opt/vr-backend
docker compose pull && docker compose up -d
```

Пересборка образа на сервере **не нужна** — образ уже собран в CI.
