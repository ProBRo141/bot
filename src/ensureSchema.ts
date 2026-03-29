import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Синхронизирует SQLite-схему до импорта PrismaClient.
 * Для Pterodactyl: в поле запуска достаточно `node bin/index.js` — отдельный `prisma db push` не нужен.
 */
const root = path.resolve(__dirname, "..");
const schemaPath = path.join(root, "prisma", "schema.prisma");

if (process.env.SKIP_PRISMA_SCHEMA_SYNC === "1") {
  // пусто — пропуск (отладка)
} else {
  if (!fs.existsSync(schemaPath)) {
    console.error("[ensureSchema] Нет файла prisma/schema.prisma");
    process.exit(1);
  }

  const pushArgs = ["db", "push", "--skip-generate", "--schema", schemaPath];

  const run = (
    command: string,
    commandArgs: string[],
    shell: boolean
  ): ReturnType<typeof spawnSync> =>
    spawnSync(command, commandArgs, {
      cwd: root,
      stdio: "inherit",
      env: process.env,
      shell,
    });

  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");

  let result: ReturnType<typeof spawnSync> | null = null;
  if (fs.existsSync(prismaCli)) {
    result = run(process.execPath, [prismaCli, ...pushArgs], false);
  }

  if (result === null || result.status !== 0) {
    if (result?.status !== 0) {
      console.warn(
        "[ensureSchema] локальный prisma CLI не сработал, пробуем npx…"
      );
    }
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    result = run(npx, ["prisma", ...pushArgs], process.platform === "win32");
  }

  if (result.error) {
    console.error("[ensureSchema]", result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      "[ensureSchema] prisma db push завершился с кодом",
      result.status
    );
    process.exit(result.status ?? 1);
  }
}
