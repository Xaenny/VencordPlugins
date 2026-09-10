/*
 * ModToolDiscord - Vencord userplugin
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * SPDX-License-Identifier: MIT
 *
 * See LICENSE in this directory for redistribution terms.
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Message, RenderModalProps } from "@vencord/discord-types";
import { Button, ChannelStore, Modal, openModal, SelectedChannelStore, showToast, TextInput, Toasts, UserStore, useState } from "@webpack/common";

import { ACTIONS, PunishAction } from "./actions";
import { commandFor, currentReason, currentTime, deleteMessage, forwardMessage, previewCommand, sendPunishment } from "./punish";
import { settings } from "./settings";
import { getGuildChannel, getGuildForwardChannel, getPresets, setGuildChannel, setGuildForwardChannel } from "./storage";

interface PunishModalProps extends RenderModalProps {
    userId: string;
    guildId: string | null | undefined;
    action?: PunishAction;
    /** Present when opened from a message - without it there is nothing to forward or delete */
    message?: Message;
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

function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: string; }) {
    return (
        <label className="vc-modtool-check">
            <input type="checkbox" checked={checked} onChange={e => onChange(e.currentTarget.checked)} />
            <span className="vc-modtool-checkbox-label">{children}</span>
        </label>
    );
}

function PunishModal({ userId: initialUserId, guildId, action, message, ...props }: PunishModalProps) {
    const presets = getPresets();

    const [userId, setUserId] = useState(initialUserId);
    const [time, setTime] = useState(currentTime());
    const [reason, setReason] = useState(currentReason());
    const [channelId, setChannelId] = useState(getGuildChannel(guildId) ?? "");
    const [forwardChannelId, setForwardChannelId] = useState(getGuildForwardChannel(guildId) ?? "");
    const [shouldForward, setShouldForward] = useState(settings.store.forwardByDefault);
    const [shouldDelete, setShouldDelete] = useState(settings.store.deleteByDefault);
    const [busy, setBusy] = useState(false);

    const user = UserStore.getUser(userId);
    const channel = channelId ? ChannelStore.getChannel(channelId) : null;
    const forwardChannel = forwardChannelId ? ChannelStore.getChannel(forwardChannelId) : null;

    function useCurrentChannel() {
        const current = SelectedChannelStore.getChannelId();
        if (!current) return;

        setChannelId(current);
        if (guildId) setGuildChannel(guildId, current);
    }

    function useCurrentForwardChannel() {
        const current = SelectedChannelStore.getChannelId();
        if (!current) return;

        setForwardChannelId(current);
        if (guildId) setGuildForwardChannel(guildId, current);
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

        // The command is the primary action - if it didn't go out, leave the message alone
        if (!result.ok) {
            setBusy(false);
            return;
        }

        // Forward first, so the message is preserved before it is deleted. If forwarding fails the
        // delete is skipped too, rather than destroying the thing we failed to keep a copy of.
        let forwarded = true;
        if (message && shouldForward) {
            forwarded = forwardChannelId
                ? await forwardMessage(message, forwardChannelId)
                : false;

            if (!forwardChannelId) {
                showToast("ModTool: no forward channel set for this server", Toasts.Type.FAILURE);
            }
        }

        if (message && shouldDelete && forwarded) {
            deleteMessage(message.channel_id, message.id);
        }

        setBusy(false);
        props.onClose();
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
            <ErrorBoundary>
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

                {message && (
                    <section className="vc-modtool-section">
                        <div className="vc-modtool-section-head">
                            <span className="vc-modtool-section-title">Message</span>
                            <span className="vc-modtool-section-note">Applied after the command is sent</span>
                        </div>

                        <CheckRow
                            checked={shouldForward}
                            onChange={value => {
                                setShouldForward(value);
                                settings.store.forwardByDefault = value;
                            }}
                        >
                            Forward the message
                        </CheckRow>

                        {shouldForward && (
                            <div className="vc-modtool-channel-picker">
                                <span className="vc-modtool-channel-current">
                                    {forwardChannel
                                        ? `Forwarding to #${forwardChannel.name}`
                                        : forwardChannelId || "No forward channel set for this server"}
                                </span>
                                <Button size={Button.Sizes.SMALL} onClick={useCurrentForwardChannel}>
                                    Use current channel
                                </Button>
                            </div>
                        )}

                        <CheckRow
                            checked={shouldDelete}
                            onChange={value => {
                                setShouldDelete(value);
                                settings.store.deleteByDefault = value;
                            }}
                        >
                            Delete the message
                        </CheckRow>

                        {shouldForward && !forwardChannelId && (
                            <span className="vc-modtool-warning">
                                Pick a forward channel, or the message won't be forwarded{shouldDelete ? " - and it won't be deleted either" : ""}.
                            </span>
                        )}
                    </section>
                )}

                {!message && (
                    <span className="vc-modtool-hint">
                        Open ModTool from a message (right-click the message, not the member) to forward or delete it.
                    </span>
                )}

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
            </ErrorBoundary>
        </Modal>
    );
}

export function openPunishModal(
    userId: string,
    guildId: string | null | undefined,
    action?: PunishAction,
    message?: Message
) {
    openModal(props => (
        <PunishModal {...props} userId={userId} guildId={guildId} action={action} message={message} />
    ));
}
