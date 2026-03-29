import { RegisteredRole, RoleCategory, RoleMessage } from "@prisma/client";
import {
  BaseExtension,
  CustomId,
  checkCustomId,
  eventHandler,
} from "@trixis/lib-ts-bot";
import {
  ActionRowBuilder,
  Collection,
  Guild,
  GuildMember,
  Message,
  Snowflake,
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

const MEMBER_FETCH_TIMEOUT_MS = 300_000; // 5 min — большие гильдии и медленный gateway

export type RegisteredRolesFmtGenerator = Awaited<
  ReturnType<typeof createRegisteredRolesFmtGenerator>
>;

export type RoleMessageUpdateResult =
  | "updated"
  | "skipped_incomplete_members"
  | "noop";

/** Загружает роли и участников; при таймауте участников не подставляет кэш (иначе сообщение «съёживается»). */
export async function createRegisteredRolesFmtGenerator(guild: Guild) {
  await guild.roles.fetch();

  let guildMembers: Collection<Snowflake, GuildMember>;
  let membersComplete = true;
  try {
    guildMembers = await guild.members.fetch({ time: MEMBER_FETCH_TIMEOUT_MS });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (code === "GuildMembersTimeout") {
      console.warn(
        `[roles] GuildMembersTimeout for guild ${guild.id}; skip using partial cache so role messages are not overwritten with incomplete data`
      );
      membersComplete = false;
      guildMembers = guild.members.cache;
    } else {
      throw error;
    }
  }

  function* fmtGenerator(roles: RegisteredRole[]) {
    for (const registeredRole of roles) {
      const role = guild.roles.cache.get(registeredRole.roleId);

      if (!role) {
        continue;
      }

      const membersFmt = guildMembers
        .filter((member) => member.roles.cache.has(role.id))
        .map((member) => member.toString())
        .join(" ");

      yield `${role} - ${membersFmt}`;
    }
  }

  return { fmtGenerator, membersComplete };
}

export function* formatRoleCategories(
  roleCategories: (RoleCategory & { roles: RegisteredRole[] })[],
  fmtGenerator: RegisteredRolesFmtGenerator["fmtGenerator"]
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
  private roleMessageUpdateChains = new Map<
    string,
    Promise<RoleMessageUpdateResult>
  >();

  async register(): Promise<void> {
    await super.register();

    setInterval(() => {
      void Promise.allSettled(
        this.client.guilds.cache.map((guild) => this.updateRoleMessages(guild))
      );
    }, 30 * 1000);
  }

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

  async updateRoleMessages(guild: Guild): Promise<RoleMessageUpdateResult> {
    const guildId = guild.id;
    const tail =
      this.roleMessageUpdateChains.get(guildId) ??
      Promise.resolve("noop" as RoleMessageUpdateResult);
    const next = tail.then(() => this.performRoleMessageUpdate(guild));
    this.roleMessageUpdateChains.set(guildId, next);
    try {
      return await next;
    } finally {
      if (this.roleMessageUpdateChains.get(guildId) === next) {
        this.roleMessageUpdateChains.delete(guildId);
      }
    }
  }

  private async performRoleMessageUpdate(
    guild: Guild
  ): Promise<RoleMessageUpdateResult> {
    const roleCategories = await prisma.roleCategory.findMany({
      where: { roles: { some: { guildId: guild.id } } },
      include: {
        roles: { where: { guildId: guild.id } },
      },
    });

    if (!roleCategories.length) {
      return "noop";
    }

    const roleMessages = await prisma.roleMessage.findMany({
      where: { guildId: guild.id },
    });

    if (!roleMessages.length) {
      return "noop";
    }

    const { fmtGenerator, membersComplete } =
      await createRegisteredRolesFmtGenerator(guild);

    if (!membersComplete) {
      return "skipped_incomplete_members";
    }

    const roleCategoriesFmt = Array.from(
      formatRoleCategories(roleCategories, fmtGenerator)
    ).join("\n\n");

    await Promise.allSettled(
      roleMessages.map((roleMessage) =>
        this.updateRoleMessage(roleMessage, roleCategoriesFmt)
      )
    );
    return "updated";
  }

  @eventHandler({ event: "messageDelete" })
  async roleMessageDeleteHandler(message: Message) {
    await prisma.roleMessage.deleteMany({ where: { messageId: message.id } });
  }

  @eventHandler({ event: "guildMemberUpdate" })
  async guildMemberUpdateHandler(
    oldMember: GuildMember,
    newMember: GuildMember
  ) {
    if (oldMember.roles.cache.size === newMember.roles.cache.size) {
      const rolesChanged = !oldMember.roles.cache.equals(
        newMember.roles.cache
      );
      if (!rolesChanged) {
        return;
      }
    }

    const registeredRoles = await prisma.registeredRole.findMany({
      where: { guildId: newMember.guild.id },
    });

    if (registeredRoles.length === 0) {
      return;
    }

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
    const roleId = stateCtx.data.roleId!;

    await prisma.registeredRole.upsert({
      where: { roleId },
      create: {
        guildId: interaction.guild!.id,
        roleCategoryId: categoryId,
        roleId,
      },
      update: {
        guildId: interaction.guild!.id,
        roleCategoryId: categoryId,
      },
    });

    stateCtx.clear();

    await interaction.editReply({
      content: phrases.roles.addRoleReply,
      components: [],
    });
  }
}
