import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { useCallback, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import Flags from "../../Flags";
import Documents from "../../lib/models/Documents";
import Hunts from "../../lib/models/Hunts";
import Settings from "../../lib/models/Settings";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import boardForHunt from "../../lib/publications/boardForHunt";
import ensureBoard from "../../methods/ensureBoard";
import { useBreadcrumb } from "../hooks/breadcrumb";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import DocumentDisplay from "./DocumentDisplay";
import FixedLayout from "./styling/FixedLayout";

// The hunt's board on the board service, embedded like a puzzle's document.
// Operators create it; after that every member can open it.

const EmptyBoard = ({ huntId }: { huntId: string }) => {
  const { t } = useTranslation();
  const { hunt, canCreate, configured } = useTracker(() => {
    const current = Hunts.findOne(huntId);
    return {
      hunt: current,
      canCreate: userMayWritePuzzlesForHunt(Meteor.user(), current),
      configured: !!Settings.findOne({ name: "board.service" }),
    };
  }, [huntId]);
  const archived = !!hunt?.isArchived;
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();

  const create = useCallback(() => {
    setCreating(true);
    setError(undefined);
    ensureBoard.call({ huntId }, (err) => {
      setCreating(false);
      if (err) setError(err.reason ?? err.message);
    });
  }, [huntId]);

  let body: React.ReactNode;
  if (!configured) {
    body = (
      <p>
        {t(
          "board.empty.unconfigured",
          "This server doesn't have a board service set up.",
        )}
      </p>
    );
  } else if (archived) {
    body = (
      <p>
        {t(
          "board.empty.archived",
          "This hunt is archived, so a board can't be set up for it.",
        )}
      </p>
    );
  } else if (canCreate) {
    body = (
      <>
        <Button onClick={create} disabled={creating}>
          {creating
            ? t("board.empty.creating", "Creating…")
            : t("board.empty.create", "Create board")}
        </Button>
        {error && (
          <Alert variant="danger" className="mt-3">
            {error}
          </Alert>
        )}
      </>
    );
  } else {
    body = (
      <p>
        {t(
          "board.empty.noBoard",
          "An operator hasn't set one up for this hunt yet.",
        )}
      </p>
    );
  }

  return (
    <div>
      <h1>{t("board.title", "Board")}</h1>
      <p>
        {t(
          "board.empty.description",
          "A shared board for laying out this hunt's rounds, puzzles and answers.",
        )}
      </p>
      {body}
    </div>
  );
};

const BoardPage = () => {
  const huntId = useParams<"huntId">().huntId!;
  const { t } = useTranslation();
  useBreadcrumb({
    title: t("board.title", "Board"),
    path: `/hunts/${huntId}/board`,
  });
  const disabled = useTracker(() => Flags.active("disable.board"), []);
  const loading = useTypedSubscribe(boardForHunt, { huntId });
  const board = useTracker(
    () =>
      Documents.findOne({
        hunt: huntId,
        provider: "board",
        puzzle: { $exists: false },
      }),
    [huntId],
  );
  const user = useTracker(() => Meteor.user(), []);

  if (disabled) {
    return (
      <Alert variant="info">
        {t("board.disabled", "The board is turned off.")}
      </Alert>
    );
  }
  if (loading()) {
    return <div>{t("common.loading", "loading")}...</div>;
  }
  if (!board || !user) {
    return <EmptyBoard huntId={huntId} />;
  }

  return (
    <FixedLayout>
      <DocumentDisplay document={board} displayMode="embed" user={user} />
    </FixedLayout>
  );
};

export default BoardPage;
