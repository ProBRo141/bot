import { BotClient } from "@trixis/lib-ts-bot";
import { GuildMember, User } from "discord.js";

export default {
  default: {
    botStarted: (client: BotClient) => `Бот ${client.user?.tag} запущен`,
    extension: "Расширение",
    commands: "Команды",
  },
  steam: {
    registerCommandName: "register",
    registerCommandDescription: "Привязка SteamID64",
    steamId64OptionName: "steamid64",
    steamId64OptionDescription: "SteamID64 вашего Steam аккаунта",
    registeredMessageContent: "Вы успешно зарегистрированы",
    steamIdAlreadyRegisteredMessageContent: "Этот SteamID уже зарегистрирован",
    alertMessageContentFmt: (member: GuildMember, roleAlertsFmt: string) =>
      `${roleAlertsFmt}\n\n${member} находится на сервере, но не находится в голосовом канале`,
    unregisterCommandName: "unregister",
    unregisterCommandDescription: "Удалить SteamID из базы",
    userOptionName: "пользователь",
    userOptionDescription: "Пользователь",
    unregisterCommandReply: (user: User) =>
      `SteamID пользователя ${user} отвязан`,
  },
  roles: {
    categoryCommandName: "категория",
    categoryCommandDescription: "Управление категориями ролей",
    addCommandName: "добавить",
    removeCommandName: "удалить",
    removeCategoryCommandDescription: "Удалить категорию",
    categoryNameOptionName: "название",
    categoryNameOptionDescription: "Название категории",
    addCategoryCommandReply: "Категория добавлена",
    roleCategorySelectMenuPlaceholder: "Выберите категорию ролей",
    removeCategorySelectReply: "Категория удалена",
    roleCommandName: "роль",
    roleCommandDescription: "Управление ролями отображения",
    roleOptionName: "роль",
    roleOptionDescription: "Роль",
    noCategoriesReply: "Категорий нет",
    addRoleReply: "Роль добавлена",
    addRoleCommandDescription: "Добавить роль",
    removeRoleCommandDescription: "Удалить роль",
    removeRoleCommandReply: "Роль удалена",
    roleMessageCommandName: "сообщение_ролей",
    roleMessageCommandDescription: "Создать сообщение ролей и категорий",
    roleMessageCommandReply: "Сообщение создано",
  },
} as const;
