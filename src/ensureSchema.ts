import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

/**
 * Синхронизирует SQLite-схему до импорта PrismaClient.
 * Нормализует DATABASE_URL в абсолютный путь (относительные file: — от каталога prisma/,
 * как в документации Prisma), иначе `db push` и PrismaClient часто попадают в разные файлы.
 */
const root = path.resolve(__dirname, "..");
const schemaPath = path.join(root, "prisma", "schema.prisma");
const schemaDir = path.dirname(schemaPath);

/** Подмешивает .env из корня и prisma/ (не перезаписывает уже заданные переменные панели). */
function mergeEnvFromDotenvFiles(): void {
  for (const envPath of [path.join(root, ".env"), path.join(schemaDir, ".env")]) {
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = val;
      }
    }
  }
}

/** SQLite в этом проекте — если нигде не задан URL, подставляем путь как в типовом prisma/.env. */
function ensureDatabaseUrl(): void {
  if (!process.env.DATABASE_URL?.trim()) {
    process.env.DATABASE_URL = "file:./database.sqlite3";
    console.log(
      "[ensureSchema] DATABASE_URL не задан (ни в env панели, ни в .env) — использую file:./database.sqlite3 → файл в prisma/"
    );
  }
}

/** Относительные SQLite-пути — относительно папки со schema.prisma (не cwd контейнера). */
function normalizeSqliteDatabaseUrl(): void {
  const url = process.env.DATABASE_URL!;
  if (!url.startsWith("file:")) {
    return;
  }

  let filePath = url.slice("file:".length).trim();
  if (filePath.startsWith("//") && filePath.length > 2) {
    filePath = filePath.replace(/^\/+/, "/");
  }

  if (path.isAbsolute(filePath)) {
    ensureSqliteParentDir(filePath);
    process.env.DATABASE_URL = "file:" + filePath.replace(/\\/g, "/");
    return;
  }

  const abs = path.resolve(schemaDir, filePath.replace(/^\.\//, ""));
  ensureSqliteParentDir(abs);
  process.env.DATABASE_URL = "file:" + abs.replace(/\\/g, "/");
  console.log("[ensureSchema] SQLite (абсолютный путь):", abs);
}

function ensureSqliteParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function resolvePrismaCli(): string | null {
  const direct = path.join(root, "node_modules", "prisma", "build", "index.js");
  if (fs.existsSync(direct)) {
    return direct;
  }
  try {
    const req = createRequire(path.join(root, "package.json"));
    return req.resolve("prisma/build/index.js");
  } catch {
    return null;
  }
}

if (process.env.SKIP_PRISMA_SCHEMA_SYNC === "1") {
  // пропуск
} else {
  if (!fs.existsSync(schemaPath)) {
    console.error("[ensureSchema] Нет файла prisma/schema.prisma");
    process.exit(1);
  }

  mergeEnvFromDotenvFiles();
  ensureDatabaseUrl();
  normalizeSqliteDatabaseUrl();

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

  const prismaCli = resolvePrismaCli();

  let result: ReturnType<typeof spawnSync> | null = null;
  if (prismaCli) {
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
