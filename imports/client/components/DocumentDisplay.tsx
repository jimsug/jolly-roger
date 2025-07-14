import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faFileAlt } from "@fortawesome/free-solid-svg-icons/faFileAlt";
import { faFilePen } from "@fortawesome/free-solid-svg-icons/faFilePen";
import { faMapLocationDot } from "@fortawesome/free-solid-svg-icons/faMapLocationDot";
import { faTable } from "@fortawesome/free-solid-svg-icons/faTable";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React from "react";
import styled from "styled-components";
import type { DocumentType } from "../../lib/models/Documents";
import type { Theme } from "../theme";

interface DocumentDisplayProps {
  document: DocumentType;
  displayMode: "link" | "embed";
  isShown: boolean;
}

const StyledDeepLink = styled.a`
  display: inline-block;
  font-weight: bold;
  white-space: nowrap;
`;

const StyledIframe = styled.iframe<{ $isShown: boolean }>`
  /* Workaround for unusual sizing behavior of iframes in iOS Safari:
   * Width and height need to be specified in absolute values then adjusted by min and max */
  width: 0;
  height: 0;
  min-width: 100%;
  max-width: 100%;
  min-height: 100%;
  max-height: 100%;
  position: absolute;
  inset: 0;
  border: 0;
  padding-bottom: env(safe-area-inset-bottom, 0);
  background-color: #f1f3f4;
  z-index: ${({ $isShown }) => ($isShown ? 1 : -1)};
`;

export const DocumentMessage = styled.span<{ theme: Theme }>`
  display: block;
  width: 100%;
  height: 100%;
  background-color: ${({ theme }) => theme.colors.documentMessageBackground};
`;

const GoogleDocumentDisplay = ({
  document,
  displayMode,
  isShown,
}: DocumentDisplayProps) => {
  let url: string;
  let title: string;
  let icon: IconDefinition;
  switch (document.value.type) {
    case "spreadsheet":
      url = `https://docs.google.com/spreadsheets/d/${document.value.id}/edit?ui=2&rm=embedded&gid=0#gid=0`;
      title = "Sheet";
      icon = faTable;
      break;
    case "document":
      url = `https://docs.google.com/document/d/${document.value.id}/edit?ui=2&rm=embedded#gid=0`;
      title = "Doc";
      icon = faFileAlt;
      break;
    case "drawing":
      url = `https://docs.google.com/drawings/d/${document.value.id}/edit?ui=2&rm=embedded`;
      title = "Drawing";
      icon = faFilePen;
      break;
    default:
      return (
        <DocumentMessage>
          Don&apos;t know how to link to a document of type{" "}
          {document.value.type}
        </DocumentMessage>
      );
  }

  switch (displayMode) {
    case "link":
      return (
        <StyledDeepLink href={url} target="_blank" rel="noreferrer noopener">
          <FontAwesomeIcon fixedWidth icon={icon} /> <span>{title}</span>
        </StyledDeepLink>
      );
    case "embed":
      /* To workaround iOS Safari iframe behavior, scrolling should be "no" */
      return (
        <StyledIframe
          title="document"
          scrolling="no"
          src={url}
          $isShown={isShown}
        />
      );
    default:
      return (
        <DocumentMessage>Unknown displayMode {displayMode}</DocumentMessage>
      );
  }
};

const DocumentDisplay = ({
  document,
  displayMode,
  isShown,
}: DocumentDisplayProps) => {
  switch (document.provider) {
    case "google":
      return (
        <GoogleDocumentDisplay
          document={document}
          displayMode={displayMode}
          isShown={isShown}
        />
      );
    default:
      return (
        <DocumentMessage>
          Unable to display document from provider {document.provider}
        </DocumentMessage>
      );
  }
};

export default DocumentDisplay;
