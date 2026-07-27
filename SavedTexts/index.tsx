/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { isPluginEnabled } from "@api/PluginManager";
import { ChatBarProps } from "@api/ChatButtons";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { insertTextIntoChatInputBox } from "@utils/discord";
import definePlugin, { IconComponent } from "@utils/types";
import { Message } from "@vencord/discord-types";
import { findCssClassesLazy } from "@webpack";
import { ExpressionPickerStore, Menu, ReactNode } from "@webpack/common";
import { ComponentType } from "react";

import { ExpressionPickerView } from "../FavoriteMedia/types";
import { settings } from "./settings";
import { openEditTextModal, TextPicker } from "./TextPicker";

const ButtonWrapperClasses = findCssClassesLazy("button", "buttonWrapper", "notificationDot");
const ChannelTextAreaClasses = findCssClassesLazy("buttonContainer", "channelTextArea", "button");

export const SavedTextsIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg width={width} height={height} className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path
            fill="currentColor"
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2 5 5h-5V4zM8 12h8v2H8v-2zm0 4h8v2H8v-2z"
        />
    </svg>
);

function PickerButton({ onClick, children }: { onClick: () => void; children: ReactNode; }) {
    return (
        <div className={`expression-picker-chat-input-button ${ChannelTextAreaClasses?.buttonContainer ?? ""}`}>
            <div
                role="button"
                tabIndex={0}
                className={`${ButtonWrapperClasses?.button ?? ""} ${ChannelTextAreaClasses?.button ?? ""}`}
                onClick={onClick}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onClick(); }}
            >
                <div className={ButtonWrapperClasses?.buttonWrapper ?? ""}>
                    {children}
                </div>
            </div>
        </div>
    );
}

function getMessageContent(message: Message) {
    return message.content
        || message.messageSnapshots?.[0]?.message.content
        || message.embeds?.find(embed => embed.type === "auto_moderation_message")?.rawDescription
        || "";
}

function isChatBarTarget(props: ChatBarProps) {
    return ["normal", "sidebar"].includes(props?.type?.analyticsName ?? "");
}

function renderTextsPanel(onSelectGIF: (item: { url: string; }) => void) {
    return (
        <TextPicker
            onSelectItem={text => {
                insertTextIntoChatInputBox(text + " ");
                ExpressionPickerStore.closeExpressionPicker();
            }}
        />
    );
}

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    const content = getMessageContent(message)?.trim();
    if (!content) return;

    const group = findGroupChildrenByChildId("copy-text", children) ?? children;
    const insertAt = group.findIndex(c => c?.props?.id === "copy-text") + 1;

    group.splice(Math.max(insertAt, 0), 0, (
        <Menu.MenuItem
            id="vc-save-text"
            label="Save Text"
            icon={SavedTextsIcon}
            action={() => openEditTextModal(undefined, undefined, content)}
        />
    ));
};

export default definePlugin({
    name: "SavedTexts",
    description: "Save and reuse text snippets from a chat bar button in the GIF picker window",
    authors: [{ name: "Zensoran", id: 0n }],
    dependencies: ["ChatInputButtonAPI"],
    settings,

    patches: [
        {
            find: '"sticker")',
            replacement: {
                match: /Vencord\.Api\.ChatButtons\._injectButtons\((\i),arguments\[0\]\)/,
                replace: "($self.injectTextsButton($1,arguments[0]),Vencord.Api.ChatButtons._injectButtons($1,arguments[0]))"
            }
        },
        {
            find: "#{intl::EXPRESSION_PICKER_CATEGORIES_A11Y_LABEL}",
            replacement: [
                {
                    match: /\(0,\i\.jsx\)\((\i),[^}]{20,40}?"aria-selected":(\i)[^}]{50,100}?#{intl::EXPRESSION_PICKER_GIF}\)\}\)/,
                    replace: "$self.renderTabs($1,$2)",
                    predicate: () => !isPluginEnabled("FavoriteMedia")
                },
                {
                    match: /\{onSelectGIF:(\i),[^}]{20,40}\}\):null,(?=(\i)===)/,
                    replace: "$&$self.renderTextsPicker($2,$1),",
                    predicate: () => !isPluginEnabled("FavoriteMedia")
                }
            ]
        }
    ],

    contextMenus: {
        message: messageContextMenuPatch
    },

    renderTabs(Tab: ComponentType<{ viewType: string; children?: ReactNode; id?: string; key?: string; "aria-controls"?: string; "aria-selected"?: boolean; isActive?: boolean; }>, activeView: string) {
        return (
            <>
                <Tab
                    id="texts-picker-tab"
                    key="texts-picker-tab"
                    aria-controls="texts-picker-tab-panel"
                    aria-selected={activeView === ExpressionPickerView.TEXTS}
                    isActive={activeView === ExpressionPickerView.TEXTS}
                    viewType={ExpressionPickerView.TEXTS}
                >
                    Texts
                </Tab>
                <Tab
                    id="gif-picker-tab"
                    key="gif-picker-tab"
                    aria-controls="gif-picker-tab-panel"
                    aria-selected={activeView === "gif"}
                    isActive={activeView === "gif"}
                    viewType="gif"
                >
                    GIFs
                </Tab>
            </>
        );
    },

    renderTextsPicker(activeView: string, _onSelectGIF: (item: { url: string; }) => void) {
        if (activeView !== ExpressionPickerView.TEXTS) return null;
        return renderTextsPanel(_onSelectGIF);
    },

    openTextsPicker(props: ChatBarProps) {
        ExpressionPickerStore.setSearchQuery("");
        (ExpressionPickerStore as { openExpressionPicker: (view: string, type: unknown, channelId?: string) => void; })
            .openExpressionPicker(ExpressionPickerView.TEXTS, props?.type, props?.channel?.id ?? "");
    },

    injectTextsButton(buttons: ReactNode[], props: ChatBarProps) {
        if (props?.disabled || !isChatBarTarget(props)) return;

        let insertIdx = buttons.length;
        for (let i = 0; i < buttons.length; i++) {
            const el = buttons[i] as { key?: string; props?: { viewType?: string; type?: string; }; } | null;
            if (!el) continue;

            if (
                el.key === "gif" ||
                el.props?.viewType === "gif" ||
                el.props?.type === "gif"
            ) {
                insertIdx = i;
                break;
            }
        }

        buttons.splice(insertIdx, 0, (
            <PickerButton key="saved-texts-btn" onClick={() => this.openTextsPicker(props)}>
                <SavedTextsIcon width={20} height={20} />
            </PickerButton>
        ));
    }
});
