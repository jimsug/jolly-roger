import { faBookmark as faBookmarkRegular } from "@fortawesome/free-regular-svg-icons/faBookmark";
import { faBookmark as faBookmarkSolid } from "@fortawesome/free-solid-svg-icons/faBookmark";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type React from "react";
import { useCallback, useState } from "react";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import { useTheme } from "styled-components";
import bookmarkPuzzle from "../../methods/bookmarkPuzzle";

interface BookmarkButtonProps<As extends React.ElementType = React.ElementType>
  extends React.HTMLAttributes<HTMLElement> {
  puzzleId: string;
  bookmarked: boolean;
  as?: As;
  ref?: React.Ref<HTMLElement>;
}

type BookmarkButtonType = <As extends React.ElementType = typeof Button>(
  props: BookmarkButtonProps<As> &
    Omit<React.ComponentPropsWithRef<As>, keyof BookmarkButtonProps>,
  context?: any,
) => React.ReactNode;

const BookmarkButton: BookmarkButtonType = ({
  puzzleId,
  bookmarked,
  ref,
  as: Component = Button,
  ...props
}) => {
  const { t } = useTranslation();
  const bookmarkText = bookmarked
    ? t("puzzle.unbookmark", "Unbookmark puzzle")
    : t("puzzle.bookmark", "Bookmark puzzle");

  const [animateBookmark, setAnimateBookmark] = useState(false);
  const onAnimationEnd = useCallback(() => {
    setAnimateBookmark(false);
  }, []);
  const toggleBookmark = useCallback(() => {
    void (async () => {
      await bookmarkPuzzle.callPromise({ puzzleId, bookmark: !bookmarked });
      setAnimateBookmark(true);
    })();
  }, [puzzleId, bookmarked]);

  const theme = useTheme();

  return (
    <Component
      ref={ref}
      onClick={toggleBookmark}
      title={bookmarkText}
      {...props}
    >
      <FontAwesomeIcon
        icon={bookmarked ? faBookmarkSolid : faBookmarkRegular}
        color={bookmarked ? theme.colors.bookmarkedIcon : theme.colors.text}
        beat={animateBookmark}
        onAnimationEnd={onAnimationEnd}
        style={{
          "--fa-animation-iteration-count": "1",
          "--fa-animation-duration": "0.2s",
        }}
      />
    </Component>
  );
};

export default BookmarkButton;
