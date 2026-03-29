import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { Config } from "zod-model";
import constants from "./utils/constants";

export const configModel = new Config(
  z.object({
    botToken: z.string().default(""),
    alertChannelId: z.string().default(""),
    alertRoleIds: z.array(z.string()).default([]),
    rconHost: z.string().default(""),
    rconPort: z.number().int().default(28017),
    rconPassword: z.string().default(""),
  })
);

const transformConfigFilename = (filename: string) =>
  path.join(constants.paths.rootPath, filename);

export type ConfigType = "development" | "production";

export const configFilepaths: Record<ConfigType, string> = {
  development: transformConfigFilename("config-dev.json"),
  production: transformConfigFilename("config.json"),
};

export const getExistingConfigFilepaths = () =>
  Object.values(configFilepaths).filter((filepath) => fs.existsSync(filepath));

const parseExistingConfig = () => {
  const existingConfigFilepath = getExistingConfigFilepaths()[0];

  if (existingConfigFilepath) {
    return configModel.parseFile(existingConfigFilepath, { encoding: "utf-8" });
  }

  const botToken =
    process.env.BOT_TOKEN?.trim() ||
    process.env.DISCORD_BOT_TOKEN?.trim() ||
    "";

  if (botToken) {
    const alertRoleIdsRaw = process.env.ALERT_ROLE_IDS?.trim();
    const alertRoleIds = alertRoleIdsRaw
      ? alertRoleIdsRaw.split(/[,;\s]+/).filter(Boolean)
      : [];
    const rconPortParsed = parseInt(process.env.RCON_PORT ?? "", 10);

    return configModel.parse({
      botToken,
      alertChannelId: process.env.ALERT_CHANNEL_ID?.trim() ?? "",
      alertRoleIds,
      rconHost: process.env.RCON_HOST?.trim() ?? "",
      rconPort: Number.isFinite(rconPortParsed) ? rconPortParsed : 28017,
      rconPassword: process.env.RCON_PASSWORD?.trim() ?? "",
    });
  }

  throw new Error(
    "Config not found: добавьте config.json (см. config.json.example) или задайте BOT_TOKEN в переменных окружения панели."
  );
};

export const config = parseExistingConfig();
