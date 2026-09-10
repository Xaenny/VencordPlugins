/*
 * ModToolDiscord - Vencord userplugin
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * SPDX-License-Identifier: MIT
 *
 * See LICENSE in this directory for redistribution terms.
 */

import { sendMessage } from "@utils/discord";
import { ChannelStore, showToast, Toasts } from "@webpack/common";

import { buildCommand, PunishAction } from "./actions";
import { settings } from "./settings";
import { getGuildChannel, logger } from "./storage";

export interface PunishRequest {
    action: PunishAction;
    userId: string;
    guildId: string | null | undefined;
    time?: string;
    reason?: string;
    /** Overrides the guild's configured channel - used by the panel's channel field */
    channelId?: string;
}

export type PunishResult =
    | { ok: true; channelId: string; content: string; }
    | { ok: false; reason: "no-channel" | "no-guild" | "failed"; };

export function commandFor(action: PunishAction): string {
    const configured = settings.store[`${action.key}Command`] as string | undefined;
    return configured?.trim() || action.defaultCommand;
}

/** Time and reason default to the last ones used, so a plain click repeats your previous choice. */
export function currentTime() {
    return settings.store.defaultTime?.trim() ?? "";
}

export function currentReason() {
    return settings.store.defaultReason?.trim() ?? "";
}

export function rememberChoice(time?: string, reason?: string) {
    if (!settings.store.rememberLastChoice) return;

    if (time?.trim()) settings.store.defaultTime = time.trim();
    if (reason?.trim()) settings.store.defaultReason = reason.trim();
}

export function previewCommand(request: PunishRequest) {
    return buildCommand(request.action, {
        command: commandFor(request.action),
        userId: request.userId,
        target: settings.store.targetFormat === "id" ? "id" : "mention",
        time: request.time ?? currentTime(),
        reason: request.reason ?? currentReason()
    });
}

/**
 * Sends the command to the guild's configured channel. Nothing here navigates - sendMessage posts
 * straight to the channel id, so the current view never changes.
 */
export async function sendPunishment(request: PunishRequest): Promise<PunishResult> {
    const channelId = request.channelId ?? getGuildChannel(request.guildId);
    if (!channelId) return { ok: false, reason: request.guildId ? "no-channel" : "no-guild" };

    const content = previewCommand(request);

    try {
        await sendMessage(channelId, { content });
    } catch (err) {
        logger.error("Failed to send the command", err);
        showToast(`ModTool: couldn't send ${content}`, Toasts.Type.FAILURE);
        return { ok: false, reason: "failed" };
    }

    rememberChoice(request.time, request.reason);

    if (settings.store.showSentToast) {
        const channelName = ChannelStore.getChannel(channelId)?.name;
        showToast(`Sent to ${channelName ? "#" + channelName : "the mod channel"}: ${content}`, Toasts.Type.SUCCESS);
    }

    return { ok: true, channelId, content };
}
