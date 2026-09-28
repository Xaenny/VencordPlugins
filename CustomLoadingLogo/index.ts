/*
 * CustomLoadingLogo - Vencord userplugin
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * SPDX-License-Identifier: MIT
 *
 * See LICENSE in this directory for redistribution terms.
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
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let settingsListener: (() => void) | null = null;

// The observer below watches every node Discord inserts anywhere in the client, and tooltips,
// context submenus and popouts are all node insertions - so its cost lands on every hover. The
// loading logo only exists on the loading screen, so once Discord is up there is nothing left for
// it to find and it is pure overhead for the rest of the session. Stop it as soon as we know the
// app has loaded.
function stopWatching() {
    observer?.disconnect();
    observer = null;

    if (stopTimer != null) {
        clearTimeout(stopTimer);
        stopTimer = null;
    }
}

export default definePlugin({
    name: "CustomLoadingLogo",
    description: "Replace Discord's loading logo with a custom image while keeping the original animation",
    authors: [{ name: "Xaenny", id: 0n }],
    settings,
    managedStyle,
    startAt: StartAt.Init,

    patches: [
        {
            find: "_loadingText",
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

        // At StartAt.Init there is no <html> yet, so documentElement is null and observe() throws.
        // Document is itself a Node, so it works as a target either way.
        observer.observe(document.documentElement ?? document, { childList: true, subtree: true });

        // POST_CONNECTION_OPEN is the reliable "we're past the loading screen" signal, but it has
        // already fired if the plugin is switched on at runtime, so time out as well.
        stopTimer = setTimeout(stopWatching, 60_000);

        settingsListener = () => replaceLoadingLogo();
        SettingsStore.addChangeListener("plugins.CustomLoadingLogo", settingsListener);
    },

    flux: {
        POST_CONNECTION_OPEN: stopWatching
    },

    stop() {
        stopWatching();

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
