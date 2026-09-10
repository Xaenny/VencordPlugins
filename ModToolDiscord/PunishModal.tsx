/*
 * ModToolDiscord - Vencord userplugin
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * SPDX-License-Identifier: MIT
 *
 * See LICENSE in this directory for redistribution terms.
 */

import { RenderModalProps } from "@vencord/discord-types";
import { Button, ChannelStore, Modal, openModal, SelectedChannelStore, TextInput, UserStore, useState } from "@webpack/common";

import { ACTIONS, PunishAction } from "./actions";
import { commandFor, currentReason, currentTime, previewCommand, sendPunishment } from "./punish";
import { getGuildChannel, getPresets, setGuildChannel } from "./storage";

interface PunishModalProps extends RenderModalProps {
    userId: string;
    guildId: string | null | undefined;
    action?: PunishAction;
}

function Chips({ values, active, onPick }: { values: string[]; active: string; onPick: (value: string) => void; }) {
    if (values.length === 0) return null;

    return (
        <div className="vc-modtool-chips">
            {values.map(value => (
                <button
                    key={value}
                    className={`vc-modtool-chip vc-modtool-chip-pick${value === active ? " vc-modtool-chip-active" : ""}`}
                    onClick={() => onPick(value)}
                >
                    {value}
                </button>
            ))}
        </div>
    );
}

function PunishModal({ userId: initialUserId, guildId, action, ...props }: PunishModalProps) {
    const presets = getPresets();

    const [userId, setUserId] = useState(initialUserId);
    const [time, setTime] = useState(currentTime());
    const [reason, setReason] = useState(currentReason());
    const [channelId, setChannelId] = useState(getGuildChannel(guildId) ?? "");
    const [busy, setBusy] = useState(false);

    const user = UserStore.getUser(userId);
    const channel = channelId ? ChannelStore.getChannel(channelId) : null;

    function useCurrentChannel() {
        const current = SelectedChannelStore.getChannelId();
        if (!current) return;

        setChannelId(current);
        if (guildId) setGuildChannel(guildId, current);
    }

    async function run(picked: PunishAction) {
        if (!userId.trim() || busy) return;

        setBusy(true);
        const result = await sendPunishment({
            action: picked,
            userId: userId.trim(),
            guildId,
            time,
            reason,
            channelId: channelId || undefined
        });
        setBusy(false);

        if (result.ok) props.onClose();
    }

    const preview = action
        ? previewCommand({ action, userId: userId.trim() || "0", guildId, time, reason })
        : null;

    return (
        <Modal
            {...props}
            title="ModTool"
            subtitle={user ? `Punishing ${user.username}` : undefined}
            size="md"
            actions={[{ text: "Close", variant: "secondary", onClick: props.onClose }]}
        >
            <div className="vc-modtool-panel">
                <section className="vc-modtool-section">
                    <div className="vc-modtool-section-head">
                        <span className="vc-modtool-section-title">Target</span>
                        <span className="vc-modtool-section-note">Filled in from the message or member you clicked</span>
                    </div>

                    <label className="vc-modtool-label" htmlFor="vc-modtool-user">User ID</label>
                    <TextInput id="vc-modtool-user" value={userId} onChange={setUserId} placeholder="User ID" />

                    <div className="vc-modtool-row">
                        <div className="vc-modtool-field">
                            <label className="vc-modtool-label">Time</label>
                            <TextInput value={time} onChange={setTime} placeholder="e.g. 1d" />
                            <Chips values={presets.times} active={time} onPick={setTime} />
                        </div>
                        <div className="vc-modtool-field">
                            <label className="vc-modtool-label">Reason</label>
                            <TextInput value={reason} onChange={setReason} placeholder="e.g. spam" />
                            <Chips values={presets.reasons} active={reason} onPick={setReason} />
                        </div>
                    </div>
                </section>

                <section className="vc-modtool-section">
                    <div className="vc-modtool-section-head">
                        <span className="vc-modtool-section-title">Command channel</span>
                        <span className="vc-modtool-section-note">Saved per server. Nothing switches channels.</span>
                    </div>

                    <div className="vc-modtool-channel-picker">
                        <span className="vc-modtool-channel-current">
                            {channel ? `#${channel.name}` : channelId || "No channel set for this server"}
                        </span>
                        <Button size={Button.Sizes.SMALL} onClick={useCurrentChannel}>Use current channel</Button>
                    </div>
                </section>

                <section className="vc-modtool-section">
                    <div className="vc-modtool-section-head">
                        <span className="vc-modtool-section-title">Punishments</span>
                        <span className="vc-modtool-section-note">Sends straight to the channel above</span>
                    </div>

                    <div className="vc-modtool-actions">
                        {ACTIONS.map(entry => (
                            <button
                                key={entry.key}
                                className={`vc-modtool-action${entry.destructive ? " vc-modtool-action-danger" : ""}${entry === action ? " vc-modtool-action-active" : ""}`}
                                disabled={busy || !userId.trim() || !channelId}
                                onClick={() => run(entry)}
                            >
                                <span className="vc-modtool-action-command">{commandFor(entry)}</span>
                                <span className="vc-modtool-action-label">{entry.label}</span>
                            </button>
                        ))}
                    </div>

                    {preview && <code className="vc-modtool-preview">{preview}</code>}
                </section>
            </div>
        </Modal>
    );
}

export function openPunishModal(userId: string, guildId: string | null | undefined, action?: PunishAction) {
    openModal(props => <PunishModal {...props} userId={userId} guildId={guildId} action={action} />);
}
