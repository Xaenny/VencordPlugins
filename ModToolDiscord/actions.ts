/*
 * ModToolDiscord - Vencord userplugin
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * SPDX-License-Identifier: MIT
 *
 * See LICENSE in this directory for redistribution terms.
 */

/** Pure action data - no settings or storage imports, so everything else can depend on this. */
export interface PunishAction {
    key: "warn" | "zap" | "tempzap" | "unzap" | "timeout" | "kick" | "ban";
    label: string;
    defaultCommand: string;
    /** Whether the command takes a duration argument before the reason */
    usesTime: boolean;
    usesReason: boolean;
    /** Rendered in red, and confirmed before sending when "Confirm destructive actions" is on */
    destructive?: boolean;
}

export const ACTIONS: readonly PunishAction[] = Object.freeze([
    { key: "warn", label: "Warn", defaultCommand: ".warn", usesTime: false, usesReason: true },
    { key: "zap", label: "Zap", defaultCommand: ".zap", usesTime: false, usesReason: true },
    { key: "tempzap", label: "Temp zap", defaultCommand: ".tempzap", usesTime: true, usesReason: true },
    { key: "unzap", label: "Unzap", defaultCommand: ".unzap", usesTime: false, usesReason: false },
    { key: "timeout", label: "Timeout", defaultCommand: ".to", usesTime: true, usesReason: true },
    { key: "kick", label: "Kick", defaultCommand: ".kick", usesTime: false, usesReason: true, destructive: true },
    { key: "ban", label: "Ban", defaultCommand: ".ban", usesTime: false, usesReason: true, destructive: true }
] as const);

export function actionByKey(key: PunishAction["key"]) {
    return ACTIONS.find(action => action.key === key)!;
}

export interface CommandParts {
    command: string;
    userId: string;
    /** "mention" sends <@id>, which renders as @name - what the legacy tool produced */
    target: "mention" | "id";
    time?: string;
    reason?: string;
}

/** Builds e.g. `.to <@1234> 1d spam` */
export function buildCommand(action: PunishAction, parts: CommandParts) {
    const target = parts.target === "id" ? parts.userId : `<@${parts.userId}>`;
    const words = [parts.command.trim(), target];

    if (action.usesTime && parts.time?.trim()) words.push(parts.time.trim());
    if (action.usesReason && parts.reason?.trim()) words.push(parts.reason.trim());

    return words.join(" ");
}
