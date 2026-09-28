/*
 * HideGiftButton - Vencord userplugin
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * SPDX-License-Identifier: MIT
 *
 * See LICENSE in this directory for redistribution terms.
 */

import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { getIntlMessage } from "@utils/discord";
import { classNameToSelector, createAndAppendStyle } from "@utils/css";
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

    // Browsers match selectors right to left and bucket every rule by the rightmost compound. A
    // rightmost compound with no class, id or tag - `[aria-label="..." i]` - lands in the universal
    // bucket, which means it is tested against every element in the document on every style
    // recalculation, and hovering anything causes a style recalculation. Measured in Chromium, the
    // attribute-only form cost ~7x the recalc time of everything else here put together, so both
    // selectors below deliberately end in a real class or a tag.
    //
    // findCssClassesLazy hands back Discord's actual hashed class, so there is no need to match a
    // substring of it either - `.${buttonClass}` is exact, and free to match.
    const channelTextArea = ChannelTextAreaClasses?.channelTextArea;
    const buttonClass = ChannelTextAreaClasses?.button;

    const scope = channelTextArea ? classNameToSelector(channelTextArea) : '[class*="channelTextArea"]';

    const selectors = getGiftAriaLabels().flatMap(label => {
        const escaped = escapeCss(label);
        const rules = [`${scope} button[aria-label="${escaped}" i]`];

        if (buttonClass) rules.push(`${scope} ${classNameToSelector(buttonClass)}[aria-label="${escaped}" i]`);

        return rules;
    });

    dynamicStyle.textContent = `${selectors.join(",\n")} { display: none !important; }`;
}

export default definePlugin({
    name: "HideGiftButton",
    description: "Removes the Nitro gift button from the chat input bar",
    authors: [{ name: "Xaenny", id: 0n }],

    settings,
    managedStyle: fallbackStyle,

    patches: [],

    start() {
        dynamicStyle = createAndAppendStyle("VcHideGiftButton", managedStyleRootNode);
        updateDynamicStyle();
    },

    stop() {
        dynamicStyle?.remove();
        dynamicStyle = null;
    }
});
