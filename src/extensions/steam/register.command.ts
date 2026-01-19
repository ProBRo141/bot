import {
  BaseSlashCommand,
  CommandContext,
  commandHandler,
} from "@trixis/lib-ts-bot";
import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import SteamExtension from ".";
import phrases from "../../phrases";
import prisma from "../../utils/prisma";

export default class RegisterCommand extends BaseSlashCommand<SteamExtension> {
  constructor(extension: SteamExtension) {
    const builder = new SlashCommandBuilder()
      .setName(phrases.steam.registerCommandName)
      .setDescription(phrases.steam.registerCommandDescription)
      .addStringOption((option) =>
        option
          .setName(phrases.steam.steamId64OptionName)
          .setDescription(phrases.steam.steamId64OptionDescription)
          .setMinLength(17)
          .setMaxLength(17)
          .setRequired(true)
      )
      .setDMPermission(false);

    super(extension, builder);
  }

  @commandHandler()
  async run({
    interaction,
    options,
  }: CommandContext<
    CommandInteraction,
    {
      [phrases.steam.steamId64OptionName]: string;
    }
  >) {
    const steamId = options[phrases.steam.steamId64OptionName];

    if (await prisma.user.count({ where: { steamId64: steamId } })) {
      return await interaction.editReply({
        content: phrases.steam.steamIdAlreadyRegisteredMessageContent,
      });
    }

    await prisma.user.upsert({
      where: { steamId64: steamId },
      create: {
        discordUserId: interaction.user.id,
        steamId64: steamId,
      },
      update: {
        steamId64: steamId,
      },
    });

    await interaction.editReply({
      content: phrases.steam.registeredMessageContent,
    });
  }
}
