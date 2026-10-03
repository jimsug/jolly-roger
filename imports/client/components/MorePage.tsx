import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { faBookmark } from "@fortawesome/free-solid-svg-icons/faBookmark";
import { faFaucet } from "@fortawesome/free-solid-svg-icons/faFaucet";
import { faReceipt } from "@fortawesome/free-solid-svg-icons/faReceipt";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useMemo } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import styled from "styled-components";
import Hunts from "../../lib/models/Hunts";
import { useBreadcrumb } from "../hooks/breadcrumb";
import Markdown from "./Markdown";
import FixedLayout from "./styling/FixedLayout";

const MorePageLayout = styled.div`
  padding: 8px 15px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  height: 100%;
  overflow-y: auto;

  > * {
    width: 100%;
  }
`;

const BookmarkletLink = styled.a`
  display: inline-block;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  padding: 0.5rem 0.8rem;
  font-size: 1.2rem;
  background: ${({ theme }) => theme.colors.background};
  cursor: grab;
`;

const MorePage = () => {
  const huntId = useParams<"huntId">().huntId!;
  const { t } = useTranslation();

  useBreadcrumb({
    title: t("more.breadcrumbTitle", "More"),
    path: `/hunts/${huntId}/more`,
  });

  const hunt = useTracker(() => Hunts.findOne(huntId), [huntId]);

  // Opens the hunt's puzzle list with the current page's title and URL, so
  // the puzzle can be added (or opened, if it already exists) in one click
  // from the hunt site.
  const bookmarklet = useMemo(() => {
    const puzzleListUrl = Meteor.absoluteUrl(`hunts/${huntId}/puzzles`);
    const code = [
      "(function(){",
      "var title=encodeURIComponent(document.title);",
      "var url=encodeURIComponent(window.location.href);",
      `window.open(${JSON.stringify(puzzleListUrl)}+"?title="+title+"&url="+url,"_blank");`,
      "})();",
    ].join("");
    return `javascript:${encodeURIComponent(code)}`;
  }, [huntId]);

  // React 19 blocks javascript: URLs in href props, so the bookmarklet's href
  // goes straight onto the DOM node.
  const setBookmarkletHref = useCallback(
    (link: HTMLAnchorElement | null) => {
      link?.setAttribute("href", bookmarklet);
    },
    [bookmarklet],
  );

  return (
    <FixedLayout>
      <MorePageLayout>
        <h1>{t("more.title", "More resources")}</h1>
        {hunt?.moreInfo && <Markdown text={hunt.moreInfo} />}
        <hr />
        <h2>{t("more.bookmarklet.title", "Bookmarklet")}</h2>
        <p>
          <strong>
            {t(
              "more.bookmarklet.dragInstruction",
              "Drag this bookmarklet to your bookmarks bar:",
            )}
          </strong>
        </p>
        <p>
          <BookmarkletLink ref={setBookmarkletHref}>
            <FontAwesomeIcon icon={faBookmark} />{" "}
            {t("more.bookmarklet.label", "Add to Jolly Roger")}
          </BookmarkletLink>
        </p>
        <p>
          {t(
            "more.bookmarklet.usage",
            `When a new puzzle is unlocked, open its page on the hunt site and
            click the bookmarklet in your bookmarks bar. Then:`,
          )}
        </p>
        <ul>
          <li>
            {t(
              "more.bookmarklet.whenMissing",
              `If the puzzle doesn't exist in Jolly Roger yet, you'll be taken
              to the Add puzzle form with the title and URL filled in, or`,
            )}
          </li>
          <li>
            <Trans
              i18nKey="more.bookmarklet.whenPresent"
              t={t}
              defaults="If the puzzle <em>does</em> exist in Jolly Roger, you'll be taken straight to its page."
              components={{ em: <em /> }}
            />
          </li>
        </ul>
        <hr />
        <h2>
          <Link to={`/hunts/${huntId}/firehose`}>
            <FontAwesomeIcon icon={faFaucet} />{" "}
            {t("chat.firehose.title", "Firehose")}
          </Link>
        </h2>
        <p>
          {t(
            "more.firehose.description",
            "The firehose shows every chat message across all of this hunt's puzzles.",
          )}
        </p>
        <h2>
          <Link to={`/hunts/${huntId}/guesses`}>
            <FontAwesomeIcon icon={faReceipt} />{" "}
            {hunt?.hasGuessQueue
              ? t("guessQueue.title.guess", "Guesses")
              : t("guessQueue.title.answer", "Answers")}
          </Link>
        </h2>
        <p>
          {hunt?.hasGuessQueue
            ? t(
                "more.guesses.description",
                "Every guess submitted in this hunt and its result.",
              )
            : t(
                "more.answers.description",
                "Every answer entered in this hunt.",
              )}
        </p>
      </MorePageLayout>
    </FixedLayout>
  );
};

export default MorePage;
