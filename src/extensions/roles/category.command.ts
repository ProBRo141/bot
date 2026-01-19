import {
  BaseSlashCommand,
  CommandContext,
  commandHandler,
} from "@trixis/lib-ts-bot";
import {
  CommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import RolesExtension, { createCategoriesSelectMenu } from ".";
import { removeCategorySelectMenuCustomId } from "../../customId";
import phrases from "../../phrases";
import prisma from "../../utils/prisma";

export default class CategoryCommand extends BaseSlashCommand<RolesExtension> {
  constructor(extension: RolesExtension) {
    const builder = new SlashCommandBuilder()
      .setName(phrases.roles.categoryCommandName)
      .setDescription(phrases.roles.categoryCommandDescription)
      .addSubcommand((subcommand) =>
        subcommand
          .setName(phrases.roles.addCommandName)
          .setDescription(phrases.roles.categoryCommandDescription)
          .addStringOption((option) =>
            option
              .setName(phrases.roles.categoryNameOptionName)
              .setDescription(phrases.roles.categoryNameOptionDescription)
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(phrases.roles.removeCommandName)
          .setDescription(phrases.roles.removeCategoryCommandDescription)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false);

    super(extension, builder);
  }

  @commandHandler({ name: phrases.roles.addCommandName })
  async runAdd({
    interaction,
    options,
  }: CommandContext<
    CommandInteraction,
    {
      [phrases.roles.categoryNameOptionName]: string;
    }
  >) {
    const title = options[phrases.roles.categoryNameOptionName];
    await prisma.roleCategory.create({ data: { title } });
    await interaction.editReply({
      content: phrases.roles.addCategoryCommandReply,
    });
  }

  @commandHandler({ name: phrases.roles.removeCommandName })
  async runRemove({ interaction }: CommandContext) {
    const categories = await prisma.roleCategory.findMany();

    await interaction.editReply({
      components: createCategoriesSelectMenu(
        categories,
        removeCategorySelectMenuCustomId
      ) as any,
    });
  }
}
