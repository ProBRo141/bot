/**
 * На Pterodactyl иногда клонируют репозиторий без src/ (только прод).
 * Тогда tsc падает с TS18003; если есть src/index.ts — компилируем, иначе ожидаем готовый bin/.
 */
const fs = require("fs");
const { execSync } = require("child_process");

if (!fs.existsSync("src/index.ts")) {
  console.log(
    "[compile-if-src] Папки src/ нет — пропускаю tsc. В репозитории должен быть уже собранный bin/."
  );
  if (!fs.existsSync("bin/index.js")) {
    console.error(
      "[compile-if-src] Нет ни src/, ни bin/index.js — нечего запускать. Добавьте исходники или закоммитьте bin/."
    );
    process.exit(1);
  }
  process.exit(0);
}

execSync("tsc", { stdio: "inherit" });
