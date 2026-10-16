/*
 * ModToolDiscord - Vencord userplugin
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * SPDX-License-Identifier: MIT
 *
 * See LICENSE in this directory for redistribution terms.
 */

import * as DataStore from "@api/DataStore";
import { Logger } from "@utils/Logger";

export const logger = new Logger("ModToolDiscord");

export const DEFAULT_TIME_PRESETS = ["5m", "10m", "1h", "1d", "3d", "1w"];
export const DEFAULT_REASON_PRESETS = ["spam", "harassment", "rule break", "politics", "racism", "cheats", "porn"];

const PRESETS_KEY = "ModToolDiscord_presets";
const CHANNELS_KEY = "ModToolDiscord_guildChannels";
const FORWARD_CHANNELS_KEY = "ModToolDiscord_guildForwardChannels";

export type PresetKind = "times" | "reasons";

export interface Presets {
    times: string[];
    reasons: string[];
}

// Context menus and popouts render synchronously, but DataStore is async - so everything is read
// from these caches and written through to disk in the background.
let presets: Presets = { times: [...DEFAULT_TIME_PRESETS], reasons: [...DEFAULT_REASON_PRESETS] };
let guildChannels: Record<string, string> = {};
let guildForwardChannels: Record<string, string> = {};

export function getPresets(): Presets {
    return presets;
}

/** The channel this guild's commands are sent to, or undefined if none has been picked yet. */
export function getGuildChannel(guildId: string | null | undefined): string | undefined {
    return guildId ? guildChannels[guildId] : undefined;
}

export function getGuildChannels(): Readonly<Record<string, string>> {
    return guildChannels;
}

/** Where this guild's messages are forwarded to before being deleted. */
export function getGuildForwardChannel(guildId: string | null | undefined): string | undefined {
    return guildId ? guildForwardChannels[guildId] : undefined;
}

export function getGuildForwardChannels(): Readonly<Record<string, string>> {
    return guildForwardChannels;
}

export async function loadStorage() {
    try {
        const storedPresets = await DataStore.get<Partial<Presets>>(PRESETS_KEY);
        if (storedPresets) {
            presets = {
                times: storedPresets.times ?? [...DEFAULT_TIME_PRESETS],
                reasons: storedPresets.reasons ?? [...DEFAULT_REASON_PRESETS]
            };
        }

        guildChannels = (await DataStore.get<Record<string, string>>(CHANNELS_KEY)) ?? {};
        guildForwardChannels = (await DataStore.get<Record<string, string>>(FORWARD_CHANNELS_KEY)) ?? {};
    } catch (err) {
        logger.error("Failed to load stored presets/channels", err);
    }
}

function savePresets() {
    DataStore.set(PRESETS_KEY, presets).catch(err => logger.error("Failed to save presets", err));
}

function saveGuildChannels() {
    DataStore.set(CHANNELS_KEY, guildChannels).catch(err => logger.error("Failed to save channels", err));
}

function saveGuildForwardChannels() {
    DataStore.set(FORWARD_CHANNELS_KEY, guildForwardChannels)
        .catch(err => logger.error("Failed to save forward channels", err));
}

export function addPreset(kind: PresetKind, rawValue: string) {
    const value = rawValue.trim();
    if (!value || presets[kind].includes(value)) return false;

    presets = { ...presets, [kind]: [...presets[kind], value] };
    savePresets();
    return true;
}

export function removePreset(kind: PresetKind, value: string) {
    presets = { ...presets, [kind]: presets[kind].filter(entry => entry !== value) };
    savePresets();
}

export function setGuildChannel(guildId: string, channelId: string | null) {
    if (channelId) guildChannels = { ...guildChannels, [guildId]: channelId };
    else {
        const { [guildId]: _removed, ...rest } = guildChannels;
        guildChannels = rest;
    }

    saveGuildChannels();
}

export function setGuildForwardChannel(guildId: string, channelId: string | null) {
    if (channelId) guildForwardChannels = { ...guildForwardChannels, [guildId]: channelId };
    else {
        const { [guildId]: _removed, ...rest } = guildForwardChannels;
        guildForwardChannels = rest;
    }

    saveGuildForwardChannels();
}
