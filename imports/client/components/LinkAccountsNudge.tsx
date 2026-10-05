import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { ServiceConfiguration } from "meteor/service-configuration";
import Badge from "react-bootstrap/Badge";
import { useTranslation } from "react-i18next";
import styled, { keyframes } from "styled-components";
import Flags from "../../Flags";
import type { LinkableService } from "../../lib/unlinkedServices";
import unlinkedServices from "../../lib/unlinkedServices";

// Prompts a hunter to link Google and Discord. Drive activity feeds presence
// and the document cache, so an unlinked Google account leaves both quietly
// incomplete.

export function useUnlinkedServices(): LinkableService[] {
  return useTracker(
    () =>
      unlinkedServices(Meteor.user(), {
        google:
          !Flags.active("disable.google") &&
          !!ServiceConfiguration.configurations.findOne({ service: "google" }),
        discord:
          !Flags.active("disable.discord") &&
          !!ServiceConfiguration.configurations.findOne({
            service: "discord",
          }),
      }),
    [],
  );
}

// The red pill on the username in the navbar
export const UnlinkedServicesBadge = ({
  missing,
}: {
  missing: LinkableService[];
}) => {
  const { t } = useTranslation();
  if (missing.length === 0) {
    return null;
  }
  const label = t(
    "navigation.linkAccountsNudge",
    "Link your accounts from My profile",
  );
  return (
    <Badge pill bg="danger" title={label}>
      {missing.length}
      <span className="visually-hidden"> {label}</span>
    </Badge>
  );
};

const pulse = keyframes`
  0% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.3;
    transform: scale(0.75);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
`;

// The dot beside My profile in the user menu
export const UnlinkedServicesDot = styled.span`
  display: inline-block;
  width: 0.5em;
  height: 0.5em;
  margin-left: 0.25em;
  border-radius: 50%;
  vertical-align: middle;
  background-color: var(--bs-danger);
  animation: ${pulse} 1s infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
