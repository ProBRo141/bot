import {
  BaseSlashCommand,
  CommandContext,
  commandHandler,
} from "@trixis/lib-ts-bot";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import RolesExtension from ".";
import phrases from "../../phrases";

export default class RefreshCommand extends BaseSlashCommand<RolesExtension> {
  constructor(extension: RolesExtension) {
    const builder = new SlashCommandBuilder()
      .setName(phrases.roles.refreshCommandName)
      .setDescription(phrases.roles.refreshCommandDescription)
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false);

    super(extension, builder);
  }

  @commandHandler()
  async run({ interaction }: CommandContext) {
    await interaction.deferReply({ ephemeral: true });

    try {
      await this.extension.updateRoleMessages(interaction.guild!);
      await interaction.editReply({
        content: phrases.roles.refreshCommandReply,
      });
    } catch (error) {
      console.error("Error refreshing role messages:", error);
      await interaction.editReply({
        content: "Произошла ошибка при обновлении сообщений",
      });
    }
  }
}
