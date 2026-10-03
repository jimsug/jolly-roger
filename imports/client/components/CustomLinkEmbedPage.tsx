import { useTracker } from "meteor/react-meteor-data";
import Alert from "react-bootstrap/Alert";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import styled from "styled-components";
import Hunts from "../../lib/models/Hunts";
import { useBreadcrumb } from "../hooks/breadcrumb";
import FixedLayout from "./styling/FixedLayout";

// The embedded site is whatever the hunt configured (a wiki, a tracker...),
// so it gets everything a normal page needs except the ability to navigate
// this tab away from Jolly Roger.
const EMBED_SANDBOX = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-modals",
  "allow-downloads",
].join(" ");

const EmbedIframe = styled.iframe`
  width: 100%;
  height: 100%;
  border: 0;
  background-color: ${({ theme }) => theme.colors.background};
`;

const CustomLinkEmbedPage = () => {
  const huntId = useParams<"huntId">().huntId!;
  const { t } = useTranslation();

  const hunt = useTracker(() => Hunts.findOne(huntId), [huntId]);
  const title =
    hunt?.customLinkName ?? t("navigation.customLinkTitle", "Custom link");

  useBreadcrumb({ title, path: `/hunts/${huntId}/custom-link` });

  if (!hunt?.customLinkUrl) {
    return (
      <Alert variant="warning">
        {t(
          "navigation.customLinkMissing",
          "This hunt doesn't have a custom link configured.",
        )}
      </Alert>
    );
  }

  return (
    <FixedLayout>
      <EmbedIframe
        src={hunt.customLinkUrl}
        title={title}
        sandbox={EMBED_SANDBOX}
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </FixedLayout>
  );
};

export default CustomLinkEmbedPage;
