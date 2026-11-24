# Spudy

Простий міст між **Telegram** та **Discord** для пересилки повідомлень, медіа та відео з TikTok / Instagram через Discord Webhooks із вебпанеллю керування.

<p align="left">
  <img src="https://img.shields.io/badge/Node.js-22%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js 22+">
  <img src="https://img.shields.io/badge/SQLite-node%3Asqlite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/Docker-amd64%20%7C%20arm64-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/Umbrel_OS-Supported-5352ED?style=for-the-badge&logo=umbrel&logoColor=white" alt="Umbrel OS">
</p>

---

## Зміст

- [Як працює код](#як-працює-код)
- [Структура проєкту](#структура-проєкту)
- [Запуск та Docker](#запуск-та-docker)
- [Підтримка Umbrel OS](#підтримка-umbrel-os)
- [Налаштування через Web UI](#налаштування-через-web-ui)
- [Змінні оточення](#змінні-оточення)

---

## Як працює код

Весь застосунок працює в **одному процесі Node.js** (Telegram-бот + Express-сервер) і використовує вбудований у Node 22 модуль `node:sqlite`, тому не потребує компіляції сторонніх C++ бібліотек.

1. **Отримання повідомлення**: `src/bot.js` отримує повідомлення з Telegram і напряму через базу (`src/db.js`) перевіряє, які вебхуки доступні користувачу (за його `Telegram ID` або загальним правилом `0`).
2. **Підготовка контенту**:
   * **Фото, відео, GIF, кружечки** (до 10 МБ) — береться пряме посилання через Telegram API.
   * **TikTok / Instagram** — посилання передається в `src/cobalt.js`, який завантажує відео, аудіо або фотокарусель через Cobalt API (із повторними спробами при збоях TikTok).
   * **Текст** — передається як звичайне повідомлення.
3. **Відправка в Discord**:
   * Якщо користувачу призначено **1 вебхук** — `src/discord.js` одразу надсилає контент у Discord з іменем та аватаркою відправника. Якщо файлів більше 10, вони автоматично діляться на кілька повідомлень.
   * Якщо вебхуків **декілька** — бот показує в Telegram кнопки вибору каналу (`Send to?:`).
4. **Логування**: статус кожної відправки зберігається в SQLite і одразу відображається на дашборді.

---

## Структура проєкту

```text
Spudy/
├── index.js              # Точка входу: запуск Web-сервера та Telegram-бота
├── Dockerfile            # Легкий образ на node:22-alpine (amd64 + arm64)
├── package.json          # Залежності проєкту
├── src/
│   ├── db.js             # Робота з вбудованим node:sqlite, таблиці та запити
│   ├── bot.js            # Логіка Telegram-бота та гарячий перезапуск
│   ├── web.js            # Express-сервер, роздача фронтенду та REST API
│   ├── cobalt.js         # Завантаження медіа через Cobalt API
│   └── discord.js        # Відправка повідомлень і файлів у Discord
├── web/                  # Вебінтерфейс (HTML, CSS та модульний JS)
└── data/
    └── data.db           # База даних SQLite (створюється автоматично)
```

---

## Запуск та Docker

### Docker Compose

Мультиархітектурний образ (`linux/amd64` та `linux/arm64`) доступний на Docker Hub: `jermorg/spudy:latest`.

```yaml
services:
  spudy:
    image: jermorg/spudy:latest
    container_name: spudy
    restart: unless-stopped
    ports:
      - "4000:4000"
    volumes:
      - ./data:/app/data
    environment:
      - WEB_PORT=4000
```

```bash
docker compose up -d
```

### Локальний запуск

Потрібен **Node.js 22.13.0+**:

```bash
git clone [https://github.com/jermorg/Spudy.git](https://github.com/jermorg/Spudy.git)
cd Spudy
npm install
npm start
```

---

## Підтримка Umbrel OS

Spudy адаптований для роботи на домашніх серверах під керуванням **Umbrel OS** (x86_64 та ARM64 / Raspberry Pi):

* **Готовий образ під ARM64 та AMD64** без нативних залежностей — швидко завантажується і мінімально навантажує систему.
* **Автоматичні права на базу даних**: при запуску контейнер сам виставляє коректного власника (`node`) для примонтованої папки `./data`, щоб уникнути помилок запису в SQLite.
* **Робота з локальним Cobalt**: якщо Cobalt крутиться поруч на Umbrel, вкажіть у налаштуваннях адресу на кшталт `http://umbrel.local:9000` (або IP хоста в мережі Docker). Модуль `src/cobalt.js` автоматично резолвить тунельні посилання `umbrel.local` всередині контейнера, а кнопка **Test** дозволяє перевірити з'єднання прямо з панелі.

---

## Налаштування через Web UI

Після запуску відкрийте `http://<IP-сервера>:4000`:

1. **Setup**: введіть токен від [@BotFather](https://t.me/BotFather) — бот одразу перевірить його та запуститься без перезапуску контейнера.
2. **Webhooks**: додайте Discord Webhook URL і перевірте роботу кнопкою **Test**.
3. **Users Access**: призначте вебхуки для конкретних `Telegram ID` або для правила **`0 (Any User)`** (діє для всіх).
4. **Routing & Media**: увімкніть потрібні типи повідомлень (текст, фото, відео, GIF, кружечки, TikTok, Instagram).
5. **Telegram & Cobalt**: тут можна змінити токен бота або вказати й протестувати адресу Cobalt API.

---

## Змінні оточення

| Змінна | За замовчуванням | Опис |
| :--- | :--- | :--- |
| `WEB_PORT` | `4000` | Порт вебпанелі та API |
| `COBALT_LOCAL_URL` | `—` | Резервна адреса Cobalt API (якщо не вказана у Web UI) |