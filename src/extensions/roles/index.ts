import { RegisteredRole, RoleCategory, RoleMessage } from "@prisma/client";
import {
  BaseExtension,
  CustomId,
  checkCustomId,
  eventHandler,
} from "@trixis/lib-ts-bot";
import {
  ActionRowBuilder,
  Guild,
  Message,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextChannel,
} from "discord.js";
import {
  removeCategorySelectMenuCustomId,
  selectCategorySelectMenuCustomId,
} from "../../customId";
import phrases from "../../phrases";
import { AddRoleState, AddRoleStateData } from "../../states";
import prisma from "../../utils/prisma";
import { StateManager, interactionStateCheck } from "../../utils/state";

export async function createRegisteredRolesFmtGenerator(guild: Guild) {
  // Не загружаем всех участников - используем role.members напрямую
  // Это предотвращает таймауты на больших серверах
  // role.members уже содержит участников роли и не требует полной загрузки

  function* fmtGenerator(roles: RegisteredRole[]) {
    for (const registeredRole of roles) {
      const role = guild.roles.cache.get(registeredRole.roleId);

      if (!role) {
        continue;
      }

      // Используем role.members напрямую - это коллекция участников роли
      // Она заполняется автоматически Discord.js и не требует fetch()
      const membersFmt = role.members
        .map((member) => member.toString())
        .join(" ");

      yield `${role} - ${membersFmt}`;
    }
  }

  return fmtGenerator;
}

export function* formatRoleCategories(
  roleCategories: (RoleCategory & { roles: RegisteredRole[] })[],
  fmtGenerator: Awaited<ReturnType<typeof createRegisteredRolesFmtGenerator>>
) {
  for (const category of roleCategories) {
    if (!category.roles.length) {
      continue;
    }

    const roleRows = Array.from(fmtGenerator(category.roles));

    if (!roleRows.length) {
      continue;
    }

    const roleRowsFmt = roleRows.join("\n");
    yield `**${category.title}**\n\n${roleRowsFmt}`;
  }
}

export const createCategoriesSelectMenu = (
  categories: RoleCategory[],
  customId: CustomId
) => {
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(customId.pack())
        .addOptions(
          ...categories.map((category) => ({
            label: category.title,
            value: category.id.toString(),
          }))
        )
        .setMinValues(1)
        .setMaxValues(1)
        .setPlaceholder(phrases.roles.roleCategorySelectMenuPlaceholder)
    ),
  ];
};

export default class RolesExtension extends BaseExtension {
  async register(): Promise<void> {
    await super.register();

    setInterval(() => {
      Promise.allSettled(
        this.client.guilds.cache.map((guild) => this.updateRoleMessages(guild))
      );
    }, 1 * 60 * 1000);
  }

  async updateRoleMessage(roleMessage: RoleMessage, content: string) {
    const channel = this.client.channels.cache.get(roleMessage.channelId) as
      | TextChannel
      | undefined;

    if (!channel) {
      return;
    }

    await channel.messages.edit(roleMessage.messageId, { content });
  }

  async updateRoleMessages(guild: Guild) {
    const roleCategories = await prisma.roleCategory.findMany({
      where: { roles: { every: { guildId: guild.id } } },
      include: { roles: true },
    });

    if (!roleCategories.length) {
      return;
    }

    const roleMessages = await prisma.roleMessage.findMany({
      where: { guildId: guild.id },
    });

    if (!roleMessages) {
      return;
    }

    const fmtGenerator = await createRegisteredRolesFmtGenerator(guild);

    const roleCategoriesFmt = Array.from(
      formatRoleCategories(roleCategories, fmtGenerator)
    ).join("\n\n");

    Promise.allSettled(
      roleMessages.map((roleMessage) =>
        this.updateRoleMessage(roleMessage, roleCategoriesFmt)
      )
    );
  }

  @eventHandler({ event: "messageDelete" })
  async roleMessageDeleteHandler(message: Message) {
    await prisma.roleMessage.deleteMany({ where: { messageId: message.id } });
  }

  @checkCustomId(removeCategorySelectMenuCustomId)
  @eventHandler({ event: "interactionCreate" })
  async removeCategorySelectHandler(interaction: StringSelectMenuInteraction) {
    await interaction.deferUpdate();

    const roleCategoryId = parseInt(interaction.values[0]);

    await prisma.roleCategory.delete({ where: { id: roleCategoryId } });

    await interaction.editReply({
      content: phrases.roles.removeCategorySelectReply,
      components: [],
    });
  }

  @interactionStateCheck<AddRoleState>("waitingCategory")
  @checkCustomId(selectCategorySelectMenuCustomId)
  @eventHandler({ event: "interactionCreate" })
  async addRoleCategoryHandler(interaction: StringSelectMenuInteraction) {
    await interaction.deferUpdate();

    const stateCtx = StateManager.getContext<AddRoleState, AddRoleStateData>(
      interaction.user.id
    );

    const categoryId = parseInt(interaction.values[0]);

    await prisma.registeredRole.create({
      data: {
        guildId: interaction.guild!.id,
        roleCategoryId: categoryId,
        roleId: stateCtx.data.roleId!,
      },
    });

    stateCtx.clear();

    await interaction.editReply({
      content: phrases.roles.addRoleReply,
      components: [],
    });
  }
}
