import {
  BaseSlashCommand,
  CommandContext,
  commandHandler,
} from "@trixis/lib-ts-bot";
import {
  CommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  User,
} from "discord.js";
import SteamExtension from ".";
import phrases from "../../phrases";
import prisma from "../../utils/prisma";

export default class UnregisterCommand extends BaseSlashCommand<SteamExtension> {
  constructor(extension: SteamExtension) {
    const builder = new SlashCommandBuilder()
      .setName(phrases.steam.unregisterCommandName)
      .setDescription(phrases.steam.unregisterCommandDescription)
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addUserOption((option) =>
        option
          .setName(phrases.steam.userOptionName)
          .setDescription(phrases.steam.userOptionDescription)
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
      [phrases.steam.userOptionName]: User;
    }
  >) {
    const user = options[phrases.steam.userOptionName];
    await prisma.user.deleteMany({ where: { discordUserId: user.id } });
    await interaction.editReply({
      content: phrases.steam.unregisterCommandReply(user),
    });
  }
}
