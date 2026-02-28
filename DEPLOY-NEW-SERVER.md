# Развёртывание на абсолютно новой машине

Пошаговая инструкция: от чистой ОС до работающего веб-приложения. Исходный код на сервер не нужен — всё поднимается из Docker.

---

## Требования к машине

- **ОС:** Linux (Ubuntu 20.04/22.04 или Debian 10/11).
- **Права:** доступ по SSH или консоль с возможностью выполнять `sudo`.
- **Ресурсы:** минимум ~512 МБ RAM, ~2 ГБ свободного места на диске.
- **Сеть:** доступ в интернет для скачивания образов Docker.

> **Важно:** используется MongoDB 4.4 (образ `mongo:4.4`), чтобы приложение работало и на серверах **без поддержки AVX** в процессоре (старые или дешёвые VPS). MongoDB 5+ на таких CPU не запускается.

---

## Шаг 1. Установка Docker

```bash
sudo apt update
sudo apt install -y docker.io
sudo systemctl enable --now docker
```

Проверка: `docker --version` — должна отобразиться версия Docker.

---

## Шаг 2. Установка Docker Compose

```bash
sudo apt install -y docker-compose
```

Проверка: `docker-compose --version`.

> Если используете плагин (команда `docker compose` через пробел), в инструкции ниже везде подставляйте `docker compose` вместо `docker-compose`.

---

## Шаг 3. Подготовка каталога и файлов

### Вариант А: клонирование репозитория (удобно для обновлений)

```bash
sudo mkdir -p /opt/vr-backend
cd /opt/vr-backend
sudo git clone https://github.com/IIIKA8/VR-backend.service.git .
cd deploy
```

Дальше работаете в каталоге `/opt/vr-backend/deploy/`.

### Вариант Б: только два файла (без git)

Создайте каталог и два файла вручную:

```bash
sudo mkdir -p /opt/vr-backend
cd /opt/vr-backend
```

1. **Файл `docker-compose.yml`** — скопируйте содержимое из репозитория:  
   https://github.com/IIIKA8/VR-backend.service/blob/main/deploy/docker-compose.yml  

2. **Файл `.env`** — создайте из примера ниже (см. шаг 4).

---

## Шаг 4. Настройка переменных окружения (.env)

Создайте файл `.env` в том же каталоге, где лежит `docker-compose.yml` (для варианта А — в `deploy/`, для варианта Б — в `/opt/vr-backend/`):

```bash
nano .env
```

Минимальное содержимое:

```env
DOCKER_IMAGE=leshien/vr-backend-web-app:latest
SESS_SECRET=ваш_секрет_не_короче_32_символов
PORT=8080
```

- **SESS_SECRET** — случайная строка для подписи сессий. Не меньше 32 символов.  
  Сгенерировать в терминале: `openssl rand -base64 32` — результат вставить в `SESS_SECRET=...`.
- **PORT** — порт на хосте (по умолчанию 8080). При необходимости измените.

Сохраните файл (в nano: Ctrl+O, Enter, Ctrl+X).

---

## Шаг 5. Запуск приложения

Из каталога с `docker-compose.yml` и `.env`:

```bash
cd /opt/vr-backend/deploy
# или: cd /opt/vr-backend   (если использовали вариант Б)
sudo docker-compose up -d
```

Docker скачает образы приложения и MongoDB 4.4, создаст контейнеры и тома. Подождите 30–60 секунд.

---

## Шаг 6. Проверка

- В браузере откройте: **http://IP_ВАШЕГО_СЕРВЕРА:8080**  
  (подставьте реальный IP или домен сервера).

- Или с самого сервера:
  ```bash
  curl http://localhost:8080/api/health
  ```
  Должен вернуться JSON со статусом и информацией о MongoDB.

---

## Полезные команды

| Действие              | Команда |
|-----------------------|--------|
| Логи приложения       | `sudo docker-compose logs -f app` |
| Логи MongoDB          | `sudo docker-compose logs -f mongodb` |
| Остановить всё        | `sudo docker-compose down` |
| Запустить снова       | `sudo docker-compose up -d` |
| Остановить и удалить данные MongoDB | `sudo docker-compose down -v` |

---

## Если что-то пошло не так

- **MongoDB постоянно перезапускается** — в логах есть сообщение про «AVX». Убедитесь, что в `docker-compose.yml` указан образ **mongo:4.4** и в healthcheck используется команда **mongo** (не `mongosh`). Перезапуск с чистым томом: `sudo docker-compose down -v && sudo docker-compose up -d`.
- **Образ приложения не находится** — проверьте, что образ `leshien/vr-backend-web-app:latest` опубликован на Docker Hub. Если репозиторий приватный, на новом сервере выполните `sudo docker login`.
- **Нет доступа по порту 8080** — откройте порт в файрволе (например `sudo ufw allow 8080/tcp && sudo ufw reload`) или измените `PORT` в `.env`.

---

## Краткая шпаргалка (уже есть Docker и docker-compose)

```bash
sudo mkdir -p /opt/vr-backend && cd /opt/vr-backend
sudo git clone https://github.com/IIIKA8/VR-backend.service.git .
cd deploy
echo "DOCKER_IMAGE=leshien/vr-backend-web-app:latest" > .env
echo "SESS_SECRET=$(openssl rand -base64 32)" >> .env
echo "PORT=8080" >> .env
sudo docker-compose up -d
```

После этого приложение доступно по адресу **http://IP_СЕРВЕРА:8080**.
