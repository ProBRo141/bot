import { User } from "@prisma/client";
import { BaseExtension } from "@trixis/lib-ts-bot";
import { TextChannel } from "discord.js";
import { client as WebSocketClient } from "websocket";
import { config } from "../../config";
import phrases from "../../phrases";
import prisma from "../../utils/prisma";

const RECONNECT_DELAY_MS = 60 * 1000;
const PLAYERLIST_INTERVAL_MS = 30 * 1000;

type PlayerPayload = {
  SteamID: string;
};

export default class SteamExtension extends BaseExtension {
  playerSteamIdsCache = new Set<string>();
  alertChannel = this.client.channels.cache.get(config.alertChannelId) as
    | TextChannel
    | undefined;

  playerListMessage = JSON.stringify({
    Identifier: 1001,
    Message: "playerlist",
    Name: "WebRcon",
  });

  ws: WebSocketClient | undefined;

  async register(): Promise<void> {
    await super.register();

    const wsUri = `ws://${config.rconHost}:${config.rconPort}/${config.rconPassword}`;
    this.ws = new WebSocketClient();

    this.ws.on("connect", (connection) => {
      console.log("Connected to WS");

      const playerListIntervalTimer = setInterval(
        () => connection.send(this.playerListMessage),
        PLAYERLIST_INTERVAL_MS
      );

      connection.on("message", (message) => {
        const messageJson = JSON.parse((message as any).utf8Data);

        if (messageJson.Identifier !== 1001) {
          return;
        }

        const steamIdPayloads = JSON.parse(
          messageJson.Message
        ) as PlayerPayload[];

        this.monitorPlayers(steamIdPayloads);
      });

      connection.on("close", (code, desc) => {
        console.error(`WS connection closed ${code}: ${desc}`);
        connection.removeAllListeners();
        clearInterval(playerListIntervalTimer);
        console.log("Reconnecting to WS");
        setTimeout(() => this.ws?.connect(wsUri), RECONNECT_DELAY_MS);
      });
    });

    this.ws.connect(wsUri);
  }

  async monitorPlayers(payloads: PlayerPayload[]) {
    if (!payloads.length) {
      return;
    }

    const steamIds = payloads.map((payload) => payload.SteamID);

    const newPlayerSteamIds = steamIds.filter(
      (steamId) => !this.playerSteamIdsCache.has(steamId)
    );

    this.playerSteamIdsCache = new Set(steamIds);

    const users = await prisma.user.findMany({
      where: { steamId64: { in: newPlayerSteamIds } },
    });

    if (!this.alertChannel) {
      return console.error("Alert channel is undefined");
    }

    Promise.allSettled(users.map((user) => this.sendUserAlert(user)));
  }

  async sendUserAlert(user: User) {
    const member =
      this.alertChannel?.guild.members.cache.get(user.discordUserId) ??
      (await this.alertChannel?.guild.members.fetch(user.discordUserId));

    if (!member || member.voice.channel) {
      return;
    }

    const rolesFmt = config.alertRoleIds
      .map((roleId) => `<@&${roleId}>`)
      .join(" ");

    await this.alertChannel?.send({
      content: phrases.steam.alertMessageContentFmt(member, rolesFmt),
    });
  }
}
