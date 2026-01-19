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
  GuildMember,
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
  const guildMembers = await guild.members.fetch();

  function* fmtGenerator(roles: RegisteredRole[]) {
    for (const registeredRole of roles) {
      const role = guild.roles.cache.get(registeredRole.roleId);

      if (!role) {
        continue;
      }

      const roleMembers = guildMembers.filter((member) =>
        member.roles.cache.has(role.id)
      );

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
  private updateDebounceMap = new Map<string, NodeJS.Timeout>();

  async register(): Promise<void> {
    await super.register();

    // Уменьшен интервал обновления с 60 до 30 секунд для более быстрого обновления
    setInterval(() => {
      Promise.allSettled(
        this.client.guilds.cache.map((guild) => this.updateRoleMessages(guild))
      );
    }, 30 * 1000); // 30 секунд вместо 60
  }

  // Debounce для предотвращения множественных обновлений
  private debouncedUpdate(guildId: string, callback: () => void, delay = 2000) {
    const existing = this.updateDebounceMap.get(guildId);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(() => {
      callback();
      this.updateDebounceMap.delete(guildId);
    }, delay);

    this.updateDebounceMap.set(guildId, timeout);
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

  async updateRoleMessages(guild: Guild): Promise<void> {
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

  // Мгновенное обновление при изменении ролей пользователя
  @eventHandler({ event: "guildMemberUpdate" })
  async guildMemberUpdateHandler(
    oldMember: GuildMember,
    newMember: GuildMember
  ) {
    // Проверяем, изменились ли роли
    if (oldMember.roles.cache.size === newMember.roles.cache.size) {
      const rolesChanged = !oldMember.roles.cache.equals(
        newMember.roles.cache
      );
      if (!rolesChanged) {
        return;
      }
    }

    // Проверяем, есть ли зарегистрированные роли в этом гилде
    const registeredRoles = await prisma.registeredRole.findMany({
      where: { guildId: newMember.guild.id },
    });

    if (registeredRoles.length === 0) {
      return;
    }

    // Проверяем, затронута ли одна из отслеживаемых ролей
    const trackedRoleIds = registeredRoles.map((r) => r.roleId);
    const oldRoleIds = Array.from(oldMember.roles.cache.keys());
    const newRoleIds = Array.from(newMember.roles.cache.keys());

    const affectedRole = trackedRoleIds.find(
      (roleId) =>
        oldRoleIds.includes(roleId) !== newRoleIds.includes(roleId)
    );

    if (!affectedRole) {
      return;
    }

    // Обновляем сообщения с задержкой (debounce) для предотвращения спама
    this.debouncedUpdate(newMember.guild.id, () => {
      this.updateRoleMessages(newMember.guild).catch((error) => {
        console.error(
          `Error updating role messages after member update:`,
          error
        );
      });
    });
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
