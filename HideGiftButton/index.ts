/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { getIntlMessage } from "@utils/discord";
import { createAndAppendStyle } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import { findCssClassesLazy } from "@webpack";

import fallbackStyle from "./style.css?managed";

const ChannelTextAreaClasses = findCssClassesLazy("channelTextArea", "button");

const INTL_KEYS = [
    "SEND_GIFT",
    "GIFT_BUTTON",
    "CHAT_INPUT_GIFT_BUTTON",
    "NITRO_GIFT_BUTTON"
];

let dynamicStyle: HTMLStyleElement | null = null;

const settings = definePluginSettings({
    hideGiftButton: {
        type: OptionType.BOOLEAN,
        description: "Hide the Nitro gift button in the chat bar",
        default: true,
        onChange: () => updateDynamicStyle()
    }
});

function escapeCss(value: string) {
    return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function getGiftAriaLabels(): string[] {
    const labels = new Set(["Send a gift"]);

    for (const key of INTL_KEYS) {
        try {
            const msg = getIntlMessage(key);
            if (typeof msg === "string" && msg.length > 0) labels.add(msg);
        } catch { }
    }

    return [...labels];
}

function updateDynamicStyle() {
    if (!dynamicStyle) return;

    if (!settings.store.hideGiftButton) {
        dynamicStyle.textContent = "";
        return;
    }

    const channelTextArea = ChannelTextAreaClasses?.channelTextArea ?? "channelTextArea";
    const buttonClass = ChannelTextAreaClasses?.button ?? "button";

    const selectors = getGiftAriaLabels().flatMap(label => {
        const escaped = escapeCss(label);
        return [
            `[class*="${channelTextArea}"] button[aria-label="${escaped}" i]`,
            `[class*="${channelTextArea}"] [class*="${buttonClass}"][aria-label="${escaped}" i]`,
            `[class*="channelTextArea"] [aria-label="${escaped}" i]`
        ];
    });

    dynamicStyle.textContent = `${selectors.join(",\n")} { display: none !important; }`;
}

export default definePlugin({
    name: "HideGiftButton",
    description: "Removes the Nitro gift button from the chat input bar",
    authors: [{ name: "Xaenny", id: 0n }],

    settings,
    managedStyle: fallbackStyle,

    patches: [
        {
            find: "ChannelTextAreaButtons",
            predicate: () => settings.store.hideGiftButton,
            replacement: [
                {
                    match: /\i\.push\(.{1,200}?,"gift"\)/,
                    replace: ""
                },
                {
                    match: /(\i)\.push\(.{1,40}?disabled:\i,.{1,40}?,"gift"\)/,
                    replace: ""
                }
            ]
        },
        {
            find: '"sticker")',
            predicate: () => settings.store.hideGiftButton,
            replacement: [
                {
                    match: /=\i\.gifts?\b/g,
                    replace: "=null"
                },
                {
                    match: /=\i\.gift\b/g,
                    replace: "=null"
                }
            ]
        }
    ],

    start() {
        dynamicStyle = createAndAppendStyle("VcHideGiftButton", managedStyleRootNode);
        updateDynamicStyle();
    },

    stop() {
        dynamicStyle?.remove();
        dynamicStyle = null;
    }
});
