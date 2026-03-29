# Discord
1. Создайте приложение https://discord.com/developers
2. Создайте бота (вкладка "Bot") в этом приложении
3. Включите вот эти галочки -> https://i.imgur.com/U9SJOvR.png
4. Пригласите бота на сервер через ссылку (галочки обязательны) -> https://i.imgur.com/hWA2mDL.png
5. Скопируйте токен бота (вкладка "Bot")

# Установка: Windows
1. Установите NodeJS LTS версии -> https://nodejs.org/
2. Распакуйте архив с ботом куда угодно
3. Заполните файл config.json своими данными
4. Запустите файл start.bat двойным кликом по нему

# Установка: *nix
1. Установите Node.js 18+ через пакетный менеджер (apt, pacman или другие)
2. Распакуйте архив с ботом куда угодно
3. Пропишите команду cd <директория с кодом>
4. Заполните файл config.json своими данными
5. `pnpm install` (или `npm install`), затем `pnpm run setup` — Prisma + сборка TypeScript в `bin/`
6. `pnpm start` или `node bin/index.js`

При старте выполняется синхронизация схемы БД (`src/ensureSchema.ts`). `DATABASE_URL` можно задать в Pterodactyl или в `prisma/.env`; если нигде нет — используется SQLite `prisma/database.sqlite3`.

**Pterodactyl:** образ Node 18+, переменная **JS file** = `bin/index.js`. В яйце установки не используйте `node:14-buster-slim`.
