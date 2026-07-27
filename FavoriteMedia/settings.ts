import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    showImageButton: {
        type: OptionType.BOOLEAN,
        description: "Show the Image picker button in the chat bar",
        default: false
    },
    showVideoButton: {
        type: OptionType.BOOLEAN,
        description: "Show the Video picker button in the chat bar",
        default: false
    },
    showFilesButton: {
        type: OptionType.BOOLEAN,
        description: "Show the Files picker button in the chat bar",
        default: false
    }
});
