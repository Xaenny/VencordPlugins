/*
 * ModToolDiscord - Vencord userplugin
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * SPDX-License-Identifier: MIT
 *
 * See LICENSE in this directory for redistribution terms.
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin, { IconComponent } from "@utils/types";
import { Channel, Message, User } from "@vencord/discord-types";
import { ChannelStore, ContextMenuApi, Menu, Toasts } from "@webpack/common";
import { ReactNode } from "react";

import { ACTIONS, PunishAction } from "./actions";
import { currentReason, currentTime, sendPunishment } from "./punish";
import { openPunishModal } from "./PunishModal";
import { settings } from "./settings";
import { getGuildChannel, getGuildForwardChannel, getPresets, loadStorage, logger, setGuildChannel, setGuildForwardChannel } from "./storage";
import managedStyle from "./style.css?managed";

export const ModToolIcon: IconComponent = ({ height = 24, width = 24, className }) => (
    <svg width={width} height={height} className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path
            fill="currentColor"
            d="M12 2 4 5v6.1c0 4.7 3.4 9.1 8 10.9 4.6-1.8 8-6.2 8-10.9V5l-8-3Zm0 2.1 6 2.3v4.7c0 3.7-2.5 7.2-6 8.8-3.5-1.6-6-5.1-6-8.8V6.4l6-2.3Zm-1 3.4v4h2v-4h-2Zm0 6v2h2v-2h-2Z"
        />
    </svg>
);

function describeDefaults(action: PunishAction) {
    const parts: string[] = [];
    if (action.usesTime) parts.push(currentTime() || "no time");
    if (action.usesReason) parts.push(currentReason() || "no reason");

    return parts.length ? parts.join(" · ") : "no arguments";
}

async function quickPunish(
    action: PunishAction,
    userId: string,
    guildId: string | null | undefined,
    overrides?: { time?: string; reason?: string; }
) {
    const needsPanel = settings.store.openPanelInstead
        || (action.destructive && settings.store.confirmDestructive);

    if (needsPanel) {
        openPunishModal(userId, guildId, action);
        return;
    }

    const result = await sendPunishment({ action, userId, guildId, ...overrides });
    if (result.ok || result.reason === "failed") return;

    // No channel picked for this server yet - open the panel so it can be chosen right there
    Toasts.show({
        message: "ModTool: pick a channel for this server first",
        id: Toasts.genId(),
        type: Toasts.Type.MESSAGE
    });
    openPunishModal(userId, guildId, action);
}

function punishItem(action: PunishAction, userId: string, guildId: string | null | undefined) {
    const presets = getPresets();
    const id = `vc-modtool-${action.key}`;

    return (
        <Menu.MenuItem
            id={id}
            key={id}
            label={action.label}
            color={action.destructive ? "danger" : undefined}
            action={() => quickPunish(action, userId, guildId)}
        >
            <Menu.MenuItem
                id={`${id}-default`}
                label={`Send (${describeDefaults(action)})`}
                action={() => quickPunish(action, userId, guildId)}
            />

            {action.usesTime && presets.times.length > 0 && (
                <Menu.MenuGroup label="Time">
                    {presets.times.map(time => (
                        <Menu.MenuItem
                            id={`${id}-time-${time}`}
                            key={time}
                            label={time}
                            action={() => quickPunish(action, userId, guildId, { time })}
                        />
                    ))}
                </Menu.MenuGroup>
            )}

            {action.usesReason && presets.reasons.length > 0 && (
                <Menu.MenuGroup label="Reason">
                    {presets.reasons.map(reason => (
                        <Menu.MenuItem
                            id={`${id}-reason-${reason}`}
                            key={reason}
                            label={reason}
                            action={() => quickPunish(action, userId, guildId, { reason })}
                        />
                    ))}
                </Menu.MenuGroup>
            )}

            <Menu.MenuSeparator />
            <Menu.MenuItem
                id={`${id}-panel`}
                label="Open panel..."
                action={() => openPunishModal(userId, guildId, action)}
            />
        </Menu.MenuItem>
    );
}

function punishItems(userId: string, guildId: string | null | undefined, message?: Message): ReactNode[] {
    return [
        ...ACTIONS.map(action => punishItem(action, userId, guildId)),
        <Menu.MenuItem
            id="vc-modtool-panel"
            key="vc-modtool-panel"
            label="Punish..."
            action={() => openPunishModal(userId, guildId, undefined, message)}
        />
    ];
}

/** Right-click menus get one entry that opens the panel - the actions live in the panel itself. */
function modToolItem(userId: string, guildId: string | null | undefined, message?: Message) {
    return (
        <Menu.MenuItem
            id="vc-modtool"
            key="vc-modtool"
            label="ModTool"
            icon={ModToolIcon}
            action={() => openPunishModal(userId, guildId, undefined, message)}
        />
    );
}

/** Guild id for a channel, or null in DMs where there is nothing to moderate. */
function guildIdOf(channel: Channel | undefined | null) {
    return channel?.guild_id ?? null;
}

const messageContextPatch: NavContextMenuPatchCallback = (children, props: { message?: Message; channel?: Channel; }) => {
    const { message } = props;
    const channel = props.channel ?? (message && ChannelStore.getChannel(message.channel_id));
    const guildId = guildIdOf(channel);

    if (!message?.author?.id || !guildId) return;

    children.push(
        <Menu.MenuGroup key="vc-modtool">
            {modToolItem(message.author.id, guildId, message)}
        </Menu.MenuGroup>
    );
};

const userContextPatch: NavContextMenuPatchCallback = (children, props: { user?: User; guildId?: string; channel?: Channel; }) => {
    const guildId = props.guildId ?? guildIdOf(props.channel);
    if (!props.user?.id || !guildId) return;

    children.push(
        <Menu.MenuGroup key="vc-modtool">
            {modToolItem(props.user.id, guildId)}
        </Menu.MenuGroup>
    );
};

const channelContextPatch: NavContextMenuPatchCallback = (children, props: { channel?: Channel; }) => {
    const { channel } = props;
    if (!channel?.guild_id) return;

    const isCommandTarget = getGuildChannel(channel.guild_id) === channel.id;
    const isForwardTarget = getGuildForwardChannel(channel.guild_id) === channel.id;

    children.push(
        <Menu.MenuGroup key="vc-modtool-channel">
            <Menu.MenuItem
                id="vc-modtool-set-channel"
                label={isCommandTarget ? "Stop sending ModTool commands here" : "Send ModTool commands here"}
                action={() => {
                    setGuildChannel(channel.guild_id, isCommandTarget ? null : channel.id);
                    Toasts.show({
                        message: isCommandTarget
                            ? "ModTool: command channel cleared for this server"
                            : `ModTool: commands for this server now go to #${channel.name}`,
                        id: Toasts.genId(),
                        type: Toasts.Type.SUCCESS
                    });
                }}
            />
            <Menu.MenuItem
                id="vc-modtool-set-forward-channel"
                label={isForwardTarget ? "Stop forwarding ModTool messages here" : "Forward ModTool messages here"}
                action={() => {
                    setGuildForwardChannel(channel.guild_id, isForwardTarget ? null : channel.id);
                    Toasts.show({
                        message: isForwardTarget
                            ? "ModTool: forward channel cleared for this server"
                            : `ModTool: messages for this server are forwarded to #${channel.name}`,
                        id: Toasts.genId(),
                        type: Toasts.Type.SUCCESS
                    });
                }}
            />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "ModToolDiscord",
    description: "Moderation shortcuts: punishment actions on messages and members that send your bot's commands to a channel you pick per server",
    authors: [{ name: "Xaenny", id: 0n }],
    dependencies: ["MessagePopoverAPI"],
    managedStyle,
    settings,

    contextMenus: {
        "message": messageContextPatch,
        "user-context": userContextPatch,
        "channel-context": channelContextPatch
    },

    messagePopoverButton: {
        icon: ModToolIcon,
        render(message: Message) {
            if (!settings.store.showHoverButton) return null;

            const channel = ChannelStore.getChannel(message.channel_id);
            const guildId = guildIdOf(channel);
            if (!message.author?.id || !guildId || !channel) return null;

            return {
                key: "vc-modtool",
                label: "ModTool",
                icon: ModToolIcon,
                message,
                channel,
                onClick: event => ContextMenuApi.openContextMenu(event, () => (
                    <Menu.Menu
                        navId="vc-modtool-popout"
                        onClose={ContextMenuApi.closeContextMenu}
                        aria-label="ModTool punishments"
                    >
                        {punishItems(message.author.id, guildId, message)}
                    </Menu.Menu>
                ))
            };
        }
    },

    async start() {
        await loadStorage();
        logger.info("Ready");
    }
});
