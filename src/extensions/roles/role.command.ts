import {
  BaseSlashCommand,
  CommandContext,
  commandHandler,
} from "@trixis/lib-ts-bot";
import {
  CommandInteraction,
  PermissionFlagsBits,
  Role,
  SlashCommandBuilder,
} from "discord.js";
import RolesExtension, { createCategoriesSelectMenu } from ".";
import { selectCategorySelectMenuCustomId } from "../../customId";
import phrases from "../../phrases";
import { AddRoleState, AddRoleStateData } from "../../states";
import prisma from "../../utils/prisma";
import { StateManager } from "../../utils/state";

export default class RoleCommand extends BaseSlashCommand<RolesExtension> {
  constructor(extension: RolesExtension) {
    const builder = new SlashCommandBuilder()
      .setName(phrases.roles.roleCommandName)
      .setDescription(phrases.roles.roleCommandDescription)
      .addSubcommand((subcommand) =>
        subcommand
          .setName(phrases.roles.addCommandName)
          .setDescription(phrases.roles.addRoleCommandDescription)
          .addRoleOption((option) =>
            option
              .setName(phrases.roles.roleOptionName)
              .setDescription(phrases.roles.roleOptionDescription)
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(phrases.roles.removeCommandName)
          .setDescription(phrases.roles.removeRoleCommandDescription)
          .addRoleOption((option) =>
            option
              .setName(phrases.roles.roleOptionName)
              .setDescription(phrases.roles.roleOptionDescription)
              .setRequired(true)
          )
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
      [phrases.roles.roleCommandName]: Role;
    }
  >) {
    const categories = await prisma.roleCategory.findMany();

    if (!categories.length) {
      return await interaction.editReply({
        content: phrases.roles.noCategoriesReply,
      });
    }

    const role = options[phrases.roles.roleOptionName];

    const stateCtx = StateManager.setState<AddRoleState, AddRoleStateData>(
      interaction.user.id,
      "waitingCategory"
    );

    stateCtx.data = { roleId: role.id };

    await interaction.editReply({
      components: createCategoriesSelectMenu(
        categories,
        selectCategorySelectMenuCustomId
      ) as any,
    });
  }

  @commandHandler({ name: phrases.roles.removeCommandName })
  async runRemove({
    interaction,
    options,
  }: CommandContext<
    CommandInteraction,
    {
      [phrases.roles.roleOptionName]: Role;
    }
  >) {
    const role = options[phrases.roles.roleOptionName];
    await prisma.registeredRole.delete({ where: { roleId: role.id } });
    await interaction.editReply({
      content: phrases.roles.removeRoleCommandReply,
    });
  }
}
