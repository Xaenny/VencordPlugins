import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    previewCharLimit: {
        type: OptionType.SLIDER,
        description: "How many characters of content to show in each text card",
        markers: [50, 100, 150, 200, 300, 400, 500, 750, 1000, 1500],
        default: 200,
        stickToMarkers: false,
    },
    showPasteCount: {
        type: OptionType.BOOLEAN,
        description: "Show how many times each saved text has been pasted",
        default: true,
    },
    allowEditPasteCount: {
        type: OptionType.BOOLEAN,
        description: "Show a button to manually edit paste counts on text cards",
        default: false,
        hidden: () => !settings.store.showPasteCount,
    },
});
