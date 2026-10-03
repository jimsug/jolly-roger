import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { useCallback, useRef, useState } from "react";
import PuzzleInterests from "../../lib/models/PuzzleInterests";
import type { PuzzleUnlockModalHandle } from "../components/PuzzleUnlockModal";

// Interest in a locked puzzle: the votes, the viewer's own, the interest
// popover's state, and the operators' unlock modal, which is mounted the
// first time it's asked for. Nothing is read while the puzzle doesn't render
// as locked.
export default function usePuzzleInterest(
  puzzleId: string,
  renderAsLocked: boolean,
) {
  const interests = useTracker(
    () =>
      renderAsLocked ? PuzzleInterests.find({ puzzle: puzzleId }).fetch() : [],
    [puzzleId, renderAsLocked],
  );
  const myInterest = useTracker(() => {
    const userId = Meteor.userId();
    return renderAsLocked && userId
      ? PuzzleInterests.findOne({ puzzle: puzzleId, createdBy: userId })
      : undefined;
  }, [puzzleId, renderAsLocked]);
  const interestScore = interests.reduce((acc, f) => acc + f.score, 0);

  const [showInterestPopover, setShowInterestPopover] = useState(false);
  const interestButtonRef = useRef<HTMLButtonElement>(null);
  const toggleInterestPopover = useCallback(() => {
    setShowInterestPopover((shown) => !shown);
  }, []);
  const hideInterestPopover = useCallback(() => {
    setShowInterestPopover(false);
  }, []);

  const [renderUnlockModal, setRenderUnlockModal] = useState(false);
  const unlockModalRef = useRef<PuzzleUnlockModalHandle>(null);
  const showUnlockModal = useCallback(() => {
    if (renderUnlockModal && unlockModalRef.current) {
      unlockModalRef.current.show();
    } else {
      setRenderUnlockModal(true);
    }
  }, [renderUnlockModal]);

  return {
    interests,
    myInterest,
    interestScore,
    showInterestPopover,
    interestButtonRef,
    toggleInterestPopover,
    hideInterestPopover,
    renderUnlockModal,
    unlockModalRef,
    showUnlockModal,
  };
}
