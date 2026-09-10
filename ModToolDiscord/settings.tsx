/*
 * ModToolDiscord - Vencord userplugin
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * SPDX-License-Identifier: MIT
 *
 * See LICENSE in this directory for redistribution terms.
 */

import { definePluginSettings } from "@api/Settings";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { useForceUpdater } from "@utils/react";
import { OptionType } from "@utils/types";
import { Button, ChannelStore, GuildStore, TextInput, useState } from "@webpack/common";

import { ACTIONS } from "./actions";
import { addPreset, getGuildChannels, getGuildForwardChannels, getPresets, PresetKind, removePreset, setGuildChannel, setGuildForwardChannel } from "./storage";

function PresetChips({ kind, placeholder }: { kind: PresetKind; placeholder: string; }) {
    const update = useForceUpdater();
    const [draft, setDraft] = useState("");
    const values = getPresets()[kind];

    function add() {
        if (addPreset(kind, draft)) {
            setDraft("");
            update();
        }
    }

    return (
        <div className="vc-modtool-preset-editor">
            <div className="vc-modtool-chips">
                {values.length === 0 && <span className="vc-modtool-empty">No presets yet</span>}
                {values.map(value => (
                    <span className="vc-modtool-chip" key={value}>
                        {value}
                        <button
                            className="vc-modtool-chip-remove"
                            aria-label={`Remove ${value}`}
                            onClick={() => { removePreset(kind, value); update(); }}
                        >
                            ×
                        </button>
                    </span>
                ))}
            </div>
            <div className="vc-modtool-add-row">
                <TextInput
                    value={draft}
                    placeholder={placeholder}
                    onChange={setDraft}
                    onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") add(); }}
                />
                <Button size={Button.Sizes.SMALL} onClick={add} disabled={!draft.trim()}>Add</Button>
            </div>
        </div>
    );
}

function TimePresetsSetting() {
    return (
        <section className="vc-modtool-setting">
            <Heading tag="h3">Time presets</Heading>
            <Paragraph className="vc-modtool-hint">Offered on timeout and temp zap actions.</Paragraph>
            <PresetChips kind="times" placeholder="e.g. 10m" />
        </section>
    );
}

function ReasonPresetsSetting() {
    return (
        <section className="vc-modtool-setting">
            <Heading tag="h3">Reason presets</Heading>
            <Paragraph className="vc-modtool-hint">Offered on every action that takes a reason.</Paragraph>
            <PresetChips kind="reasons" placeholder="e.g. spam" />
        </section>
    );
}

function GuildChannelsSetting() {
    const update = useForceUpdater();
    const commandChannels = getGuildChannels();
    const forwardChannels = getGuildForwardChannels();
    const entries = [...new Set([...Object.keys(commandChannels), ...Object.keys(forwardChannels)])];

    return (
        <section className="vc-modtool-setting">
            <Heading tag="h3">Command channels</Heading>
            <Paragraph className="vc-modtool-hint">
                Where each server's commands are sent, and where its messages are forwarded. Set them by
                right-clicking a channel and picking "Send ModTool commands here" or
                "Forward ModTool messages here".
            </Paragraph>
            {entries.length === 0
                ? <span className="vc-modtool-empty">No servers configured yet</span>
                : (
                    <div className="vc-modtool-channel-list">
                        {entries.map(guildId => (
                            <div className="vc-modtool-channel-row" key={guildId}>
                                <span className="vc-modtool-channel-guild">
                                    {GuildStore.getGuild(guildId)?.name ?? `Server ${guildId}`}
                                </span>
                                <span className="vc-modtool-channel-name">
                                    {commandChannels[guildId]
                                        ? `commands -> #${ChannelStore.getChannel(commandChannels[guildId])?.name ?? commandChannels[guildId]}`
                                        : "no command channel"}
                                    {forwardChannels[guildId] &&
                                        `, forwards -> #${ChannelStore.getChannel(forwardChannels[guildId])?.name ?? forwardChannels[guildId]}`}
                                </span>
                                <Button
                                    size={Button.Sizes.SMALL}
                                    color={Button.Colors.RED}
                                    onClick={() => {
                                        setGuildChannel(guildId, null);
                                        setGuildForwardChannel(guildId, null);
                                        update();
                                    }}
                                >
                                    Remove
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
        </section>
    );
}

const commandSettings = Object.fromEntries(ACTIONS.map(action => [
    `${action.key}Command`,
    {
        type: OptionType.STRING,
        description: `Command for ${action.label}`,
        default: action.defaultCommand
    }
]));

export const settings = definePluginSettings({
    ...commandSettings,

    defaultTime: {
        type: OptionType.STRING,
        description: "Time used when you don't pick one (also updated by your last choice)",
        default: "1d"
    },
    defaultReason: {
        type: OptionType.STRING,
        description: "Reason used when you don't pick one (also updated by your last choice)",
        default: "spam"
    },
    rememberLastChoice: {
        type: OptionType.BOOLEAN,
        description: "Remember the last time and reason you picked, and reuse them on the next click",
        default: true
    },
    targetFormat: {
        type: OptionType.SELECT,
        description: "How the user is written into the command",
        options: [
            { label: "Mention - .to @user 1d spam", value: "mention", default: true },
            { label: "Raw ID - .to 1234 1d spam", value: "id" }
        ]
    },
    openPanelInstead: {
        type: OptionType.BOOLEAN,
        description: "Open the punish panel instead of sending straight away",
        default: false
    },
    confirmDestructive: {
        type: OptionType.BOOLEAN,
        description: "Open the panel first for kick and ban, even when sending straight away",
        default: true
    },
    showHoverButton: {
        type: OptionType.BOOLEAN,
        description: "Show a ModTool button on message hover",
        default: true,
        restartNeeded: true
    },
    forwardByDefault: {
        type: OptionType.BOOLEAN,
        description: "Tick \"Forward the message\" by default in the panel",
        default: false
    },
    deleteByDefault: {
        type: OptionType.BOOLEAN,
        description: "Tick \"Delete the message\" by default in the panel",
        default: false
    },
    showSentToast: {
        type: OptionType.BOOLEAN,
        description: "Show a toast with the command that was sent",
        default: true
    },

    timePresets: {
        type: OptionType.COMPONENT,
        description: "Time presets",
        component: TimePresetsSetting
    },
    reasonPresets: {
        type: OptionType.COMPONENT,
        description: "Reason presets",
        component: ReasonPresetsSetting
    },
    guildChannels: {
        type: OptionType.COMPONENT,
        description: "Command channels",
        component: GuildChannelsSetting
    }
});
