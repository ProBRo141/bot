import {
  BaseSlashCommand,
  CommandContext,
  commandHandler,
} from "@trixis/lib-ts-bot";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import RolesExtension, {
  createRegisteredRolesFmtGenerator,
  formatRoleCategories,
} from ".";
import phrases from "../../phrases";
import prisma from "../../utils/prisma";

export default class MessageCommand extends BaseSlashCommand<RolesExtension> {
  constructor(extension: RolesExtension) {
    const builder = new SlashCommandBuilder()
      .setName(phrases.roles.roleMessageCommandName)
      .setDescription(phrases.roles.roleMessageCommandDescription)
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false);

    super(extension, builder);
  }

  @commandHandler()
  async run({ interaction }: CommandContext) {
    const guildId = interaction.guild!.id;
    const categories = await prisma.roleCategory.findMany({
      where: { roles: { some: { guildId } } },
      include: {
        roles: { where: { guildId } },
      },
    });

    if (!categories.length) {
      return await interaction.editReply({
        content: phrases.roles.noCategoriesReply,
      });
    }

    const { fmtGenerator, membersComplete } =
      await createRegisteredRolesFmtGenerator(interaction.guild!);

    if (!membersComplete) {
      return await interaction.editReply({
        content: phrases.roles.membersFetchIncompleteReply,
      });
    }

    const categoriesFmt = Array.from(
      formatRoleCategories(categories, fmtGenerator)
    ).join("\n\n");

    const message = await interaction.channel?.send({ content: categoriesFmt });

    if (!message) {
      return;
    }

    await prisma.roleMessage.create({
      data: {
        guildId: message.guild!.id,
        channelId: message.channel.id,
        messageId: message.id,
      },
    });

    await interaction.editReply({
      content: phrases.roles.roleMessageCommandReply,
    });
  }
}
