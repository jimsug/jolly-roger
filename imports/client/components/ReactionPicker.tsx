import type { EmojiClickData } from "emoji-picker-react";
import EmojiPicker, {
  Theme as EmojiPickerTheme,
  EmojiStyle,
} from "emoji-picker-react";
import { useCallback } from "react";
import { useTheme } from "styled-components";

// The reactions offered before the full list: ✅ ❎ ❗ ❓ ↔️
const QUICK_REACTIONS = ["2705", "274e", "2757", "2753", "2194-fe0f"];

const PREVIEW_CONFIG = { showPreview: false };

// The emoji picker, in a module of its own so that it (and the emoji data it
// carries) only loads once someone opens it.
const ReactionPicker = ({
  width,
  height,
  onPick,
}: {
  width: number;
  height: number;
  onPick: (emoji: string) => void;
}) => {
  const theme = useTheme();
  const onEmojiClick = useCallback(
    (data: EmojiClickData) => onPick(data.emoji),
    [onPick],
  );
  return (
    <EmojiPicker
      onEmojiClick={onEmojiClick}
      autoFocusSearch={false}
      emojiStyle={EmojiStyle.NATIVE}
      skinTonesDisabled
      lazyLoadEmojis
      reactionsDefaultOpen
      reactions={QUICK_REACTIONS}
      previewConfig={PREVIEW_CONFIG}
      theme={
        theme.basicMode === "dark"
          ? EmojiPickerTheme.DARK
          : EmojiPickerTheme.LIGHT
      }
      width={width}
      height={height}
    />
  );
};

export default ReactionPicker;
