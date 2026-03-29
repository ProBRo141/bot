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
      const result = await this.extension.updateRoleMessages(
        interaction.guild!
      );
      const content =
        result === "updated"
          ? phrases.roles.refreshCommandReply
          : result === "skipped_incomplete_members"
            ? phrases.roles.refreshSkippedIncompleteMembersReply
            : phrases.roles.refreshNothingToDoReply;
      await interaction.editReply({ content });
    } catch (error) {
      console.error("Error refreshing role messages:", error);
      await interaction.editReply({
        content: "Произошла ошибка при обновлении сообщений",
      });
    }
  }
}
