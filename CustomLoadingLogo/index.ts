/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SettingsStore } from "@api/Settings";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType, StartAt } from "@utils/types";
import { React } from "@webpack/common";

import managedStyle from "./style.css?managed";

const DEFAULT_LOGO = "https://i.imgur.com/rLPrwqN.png";
const LOGO_VIDEO = /\/assets\/[a-f0-9]+\.webm(?:\?|$)/i;
const MARK = "vc-custom-loading-logo";

const settings = definePluginSettings({
    logoUrl: {
        type: OptionType.STRING,
        description: "Custom loading logo image URL (PNG or WebP recommended)",
        default: DEFAULT_LOGO
    }
});

function getLogoUrl() {
    const url = settings.store.logoUrl.trim();
    return url || DEFAULT_LOGO;
}

function isLoadingLogoVideo(video: HTMLVideoElement) {
    const src = video.currentSrc || video.src || "";
    if (!LOGO_VIDEO.test(src)) return false;

    if (video.closest("[class*='message'], [class*='embed'], [class*='player'], [class*='video']")) {
        return false;
    }

    return !!video.closest("#app-mount, body");
}

function replaceLoadingLogo(root: ParentNode = document) {
    const url = getLogoUrl();

    for (const video of root.querySelectorAll("video")) {
        if (!(video instanceof HTMLVideoElement)) continue;
        if (!isLoadingLogoVideo(video)) continue;

        let img = video.parentElement?.querySelector(`img.${MARK}`) as HTMLImageElement | null;

        if (!img) {
            img = document.createElement("img");
            img.className = `${video.className} ${MARK}`.trim();
            img.alt = "";
            img.draggable = false;
            video.insertAdjacentElement("afterend", img);
            video.classList.add("vc-custom-loading-logo-hidden");
        }

        if (img.src !== url) img.src = url;

        img.className = `${video.className} ${MARK}`.trim();
        img.style.cssText = video.style.cssText;
    }
}

let observer: MutationObserver | null = null;
let settingsListener: (() => void) | null = null;

export default definePlugin({
    name: "CustomLoadingLogo",
    description: "Replace Discord's loading logo with a custom image while keeping the original animation",
    authors: [{ name: "Xaenny", id: 0n }],
    settings,
    managedStyle,
    startAt: StartAt.Init,

    patches: [
        {
            find: "#{intl::LOADING_DID_YOU_KNOW}",
            replacement: {
                match: /(\i)=>\i\.createElement\("video",(\{[^}]+\})\)/,
                replace: "$1=>$self.renderLoadingLogo($2)"
            },
            noWarn: true
        }
    ],

    renderLoadingLogo(videoProps: Record<string, unknown>) {
        const url = getLogoUrl();

        return React.createElement("img", {
            ...videoProps,
            src: url,
            className: `${String(videoProps.className ?? "")} ${MARK}`.trim(),
            alt: "",
            draggable: false
        });
    },

    start() {
        replaceLoadingLogo();

        observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node instanceof HTMLVideoElement) {
                        replaceLoadingLogo(node.parentElement ?? document);
                    } else if (node instanceof Element) {
                        replaceLoadingLogo(node);
                    }
                }
            }
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });

        settingsListener = () => replaceLoadingLogo();
        SettingsStore.addChangeListener("plugins.CustomLoadingLogo", settingsListener);
    },

    stop() {
        observer?.disconnect();
        observer = null;

        if (settingsListener) {
            SettingsStore.removeChangeListener("plugins.CustomLoadingLogo", settingsListener);
            settingsListener = null;
        }

        document.querySelectorAll(`img.${MARK}`).forEach(el => el.remove());
        document.querySelectorAll(".vc-custom-loading-logo-hidden").forEach(el => {
            el.classList.remove("vc-custom-loading-logo-hidden");
        });
    }
});
