import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { faBullhorn } from "@fortawesome/free-solid-svg-icons/faBullhorn";
import { faChalkboard } from "@fortawesome/free-solid-svg-icons/faChalkboard";
import { faDisplay } from "@fortawesome/free-solid-svg-icons/faDisplay";
import { faEllipsisH } from "@fortawesome/free-solid-svg-icons/faEllipsisH";
import { faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons/faExternalLinkAlt";
import { faMap } from "@fortawesome/free-solid-svg-icons/faMap";
import { faNoteSticky } from "@fortawesome/free-solid-svg-icons/faNoteSticky";
import { faTags } from "@fortawesome/free-solid-svg-icons/faTags";
import { faUsers } from "@fortawesome/free-solid-svg-icons/faUsers";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Nav from "react-bootstrap/Nav";
import { useTranslation } from "react-i18next";
import { NavLink, useParams } from "react-router";
import styled, { css } from "styled-components";
import Flags from "../../Flags";
import Hunts from "../../lib/models/Hunts";
import Whiteboards from "../../lib/models/Whiteboards";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import whiteboardForHunt from "../../lib/publications/whiteboardForHunt";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import { mediaBreakpointDown } from "./styling/responsive";

const JRLinkList = styled(Nav)`
  margin-right: 8px;
  flex: 1 1 auto;
  display: flex;
  justify-content: flex-end;
  align-items: center;

  ${mediaBreakpointDown(
    "sm",
    css`
      justify-content: space-between;
      align-items: stretch;
      border: 1px solid #0d6efd;
      margin-right: 0;
      padding-right: 0;
    `,
  )}
`;

const StyledPuzzleListLinkAnchor = styled(NavLink)`
  display: flex;
  align-items: center;
  justify-content: center;
  max-height: 50px;
  overflow: hidden;
  flex-direction: column;
  padding: 0 12px;
  color: ${({ theme }) => theme.colors.text};

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    text-decoration: none;
    opacity: 0.8;
  }

  ${mediaBreakpointDown(
    "lg",
    css`
      padding: 0 8px;
    `,
  )}

  ${mediaBreakpointDown(
    "sm",
    css`
      flex: 1;
      font-size: 1rem;

      &:hover {
        background: #f0f0f0;
      }
    `,
  )}
`;

const HuntLinkAnchor = styled(StyledPuzzleListLinkAnchor)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  ${mediaBreakpointDown(
    "sm",
    css`
      color: white;
      background: #0d6efd;

      &:hover {
        background: #0a58ca;
        color: white;
      }
    `,
  )}

  ${mediaBreakpointDown(
    "sm",
    css`
      margin-left: 0;
      flex: 1;
      height: 100%;
      padding: 6px 0;

      a {
        border-radius: 0;
        flex: 1;
        height: 100%;
        padding: 4px 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    `,
  )}
`;

const StyledPuzzleListLinkLabel = styled.span`
  ${mediaBreakpointDown(
    "lg",
    css`
      margin-left: 0;
      font-size: 0.8rem;
      text-align: center;
    `,
  )}
  ${mediaBreakpointDown(
    "md",
    css`
      display: none;
    `,
  )}
`;

const MenuIcon = styled(FontAwesomeIcon)`
  ${mediaBreakpointDown(
    "md",
    css`
      margin-bottom: 2px;
      padding: 0.2rem;
    `,
  )}
`;

const HuntNav = () => {
  const huntId = useParams<"huntId">().huntId!;
  const hunt = useTracker(() => Hunts.findOne(huntId)!, [huntId]);
  const { canUpdate } = useTracker(() => {
    return {
      canUpdate: userMayWritePuzzlesForHunt(Meteor.user(), hunt),
    };
  }, [hunt]);
  const { t } = useTranslation();
  useTypedSubscribe(whiteboardForHunt, { huntId });
  // Members see the link once a board exists; operators also see it before
  // then, so they can create one.
  const showWhiteboard = useTracker(
    () =>
      !Flags.active("disable.whiteboard") &&
      (canUpdate || !!Whiteboards.findOne({ hunt: huntId })),
    [canUpdate, huntId],
  );
  const notesDisabled = useTracker(
    () => Flags.active("disable.puzzle_notes"),
    [],
  );

  if (huntId && hunt) {
    // Once a hunt is archived its site often moves, so prefer the archive URL
    const huntUrl = hunt.archivedHuntUrl ?? hunt.homepageUrl;
    const huntLink = huntUrl && (
      <HuntLinkAnchor
        to={huntUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={
          hunt.archivedHuntUrl
            ? t("navigation.huntArchiveLinkTitle", "Open the hunt archive")
            : t("navigation.huntLinkTitle", "Open the hunt homepage")
        }
      >
        <MenuIcon icon={faMap} />
        <StyledPuzzleListLinkLabel>
          {t("navigation.huntLinkText", "Hunt")}
        </StyledPuzzleListLinkLabel>
      </HuntLinkAnchor>
    );
    // A hunt can add one link of its own, shown embedded in Jolly Roger or
    // opened in a new tab.
    let customLink = null;
    if (hunt.customLinkName && hunt.customLinkUrl) {
      customLink = hunt.customLinkEmbed ? (
        <StyledPuzzleListLinkAnchor
          to={`/hunts/${huntId}/custom-link`}
          title={hunt.customLinkName}
        >
          <MenuIcon icon={faDisplay} />
          <StyledPuzzleListLinkLabel>
            {hunt.customLinkName}
          </StyledPuzzleListLinkLabel>
        </StyledPuzzleListLinkAnchor>
      ) : (
        <StyledPuzzleListLinkAnchor
          to={hunt.customLinkUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={hunt.customLinkName}
        >
          <MenuIcon icon={faExternalLinkAlt} />
          <StyledPuzzleListLinkLabel>
            {hunt.customLinkName}
          </StyledPuzzleListLinkLabel>
        </StyledPuzzleListLinkAnchor>
      );
    }

    return (
      <JRLinkList>
        <StyledPuzzleListLinkAnchor
          to={`/hunts/${huntId}/announcements`}
          title={t("announcements.navTitle", "Announcements")}
        >
          <MenuIcon icon={faBullhorn} />
          <StyledPuzzleListLinkLabel>
            {t("announcements.navTitle", "Announcements")}
          </StyledPuzzleListLinkLabel>
        </StyledPuzzleListLinkAnchor>
        {customLink}

        <StyledPuzzleListLinkAnchor
          to={`/hunts/${huntId}/hunters`}
          title={t("hunterList.navTitle", "Hunters")}
        >
          <MenuIcon icon={faUsers} />
          <StyledPuzzleListLinkLabel>
            {t("hunterList.navTitle", "Hunters")}
          </StyledPuzzleListLinkLabel>
        </StyledPuzzleListLinkAnchor>

        {showWhiteboard && (
          <StyledPuzzleListLinkAnchor
            to={`/hunts/${huntId}/whiteboard`}
            title={t("whiteboard.title", "Whiteboard")}
          >
            <MenuIcon icon={faChalkboard} />
            <StyledPuzzleListLinkLabel>
              {t("whiteboard.title", "Whiteboard")}
            </StyledPuzzleListLinkLabel>
          </StyledPuzzleListLinkAnchor>
        )}

        {/* Notes and the tag manager are operator tools. The guess queue and
            firehose are linked from the More page instead of the bar. */}
        {canUpdate && !notesDisabled && (
          <StyledPuzzleListLinkAnchor
            to={`/hunts/${huntId}/notes`}
            title={t("notes.navTitle", "Notes")}
          >
            <MenuIcon icon={faNoteSticky} />
            <StyledPuzzleListLinkLabel>
              {t("notes.navTitle", "Notes")}
            </StyledPuzzleListLinkLabel>
          </StyledPuzzleListLinkAnchor>
        )}
        {canUpdate && (
          <StyledPuzzleListLinkAnchor
            to={`/hunts/${huntId}/tags`}
            title={t("tags.navTitle", "Tags")}
          >
            <MenuIcon icon={faTags} />
            <StyledPuzzleListLinkLabel>
              {t("tags.navTitle", "Tags")}
            </StyledPuzzleListLinkLabel>
          </StyledPuzzleListLinkAnchor>
        )}
        {huntLink}

        <StyledPuzzleListLinkAnchor
          to={`/hunts/${huntId}/more`}
          title={t("more.navTitle", "More")}
        >
          <MenuIcon icon={faEllipsisH} />
          <StyledPuzzleListLinkLabel>
            {t("more.navTitle", "More")}
          </StyledPuzzleListLinkLabel>
        </StyledPuzzleListLinkAnchor>
      </JRLinkList>
    );
  } else {
    return undefined;
  }
};

export default HuntNav;
