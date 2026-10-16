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
    /**
     * Argument order, when it isn't the usual `<command> <target> [time] [reason]`.
     *
     * "time-then-id" is `<command> <time> <userId>`: the duration first, the raw id rather than a
     * mention, and no reason. That is what the bot's tempzap expects - `.tempzap 3d 3485686...` -
     * and it ignores the "How the user is written into the command" setting, because the id is
     * part of the shape rather than a preference.
     */
    shape?: "time-then-id";
}

export const ACTIONS: readonly PunishAction[] = Object.freeze([
    { key: "warn", label: "Warn", defaultCommand: ".warn", usesTime: false, usesReason: true },
    { key: "zap", label: "Zap", defaultCommand: ".zap", usesTime: false, usesReason: true },
    { key: "tempzap", label: "Temp zap", defaultCommand: ".tempzap", usesTime: true, usesReason: false, shape: "time-then-id" },
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

/** Builds e.g. `.to <@1234> 1d spam`, or `.tempzap 3d 1234` for a time-then-id action. */
export function buildCommand(action: PunishAction, parts: CommandParts) {
    if (action.shape === "time-then-id") {
        return [parts.command.trim(), parts.time?.trim(), parts.userId]
            .filter(word => word)
            .join(" ");
    }

    const target = parts.target === "id" ? parts.userId : `<@${parts.userId}>`;
    const words = [parts.command.trim(), target];

    if (action.usesTime && parts.time?.trim()) words.push(parts.time.trim());
    if (action.usesReason && parts.reason?.trim()) words.push(parts.reason.trim());

    return words.join(" ");
}
