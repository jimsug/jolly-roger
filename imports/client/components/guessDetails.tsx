import Badge from "react-bootstrap/Badge";
import { useTranslation } from "react-i18next";
import type { GuessType } from "../../lib/models/Guesses";

const formatGuessDirection = (value: GuessType["direction"]) => {
  if (value === undefined) {
    return "Unspecified";
  }
  if (value === 0) {
    return "Neutral";
  }
  const directionStr = value > 0 ? "Forward" : "Back";
  return `${directionStr} ${Math.abs(value)}`;
};

const formatConfidence = (value: GuessType["confidence"]) => {
  if (value === undefined) {
    return "Unspecified";
  }
  return `${value}%`;
};

// The direction slider (-10 to 10) summarised as a word. An unset direction
// reads as mixed.
type GuessDirectionLevel =
  | "forward"
  | "mostlyForward"
  | "mixed"
  | "mostlyBack"
  | "back";

const guessDirectionLevel = (
  value: GuessType["direction"] = 0,
): GuessDirectionLevel => {
  if (value > 5) {
    return "forward";
  }
  if (value > 0) {
    return "mostlyForward";
  }
  if (value < -5) {
    return "back";
  }
  if (value < 0) {
    return "mostlyBack";
  }
  return "mixed";
};

// The confidence slider (0 to 100) summarised as a word. An unset confidence
// reads as medium.
type GuessConfidenceLevel = "high" | "medium" | "low";

const guessConfidenceLevel = (
  value: GuessType["confidence"] = 50,
): GuessConfidenceLevel => {
  if (value > 50) {
    return "high";
  }
  if (value < 50) {
    return "low";
  }
  return "medium";
};

const DIRECTION_BADGES: Record<
  GuessDirectionLevel,
  { variant: string; label: string }
> = {
  forward: { variant: "primary", label: "Forward" },
  mostlyForward: { variant: "primary", label: "Forward*" },
  mixed: { variant: "secondary", label: "Mixed" },
  mostlyBack: { variant: "danger", label: "Back*" },
  back: { variant: "danger", label: "Back" },
};

const CONFIDENCE_BADGES: Record<
  GuessConfidenceLevel,
  { variant: string; label: string }
> = {
  high: { variant: "success", label: "High" },
  medium: { variant: "warning", label: "Medium" },
  low: { variant: "danger", label: "Low" },
};

const GuessDirectionBadge = ({ value }: { value: GuessType["direction"] }) => {
  const { t } = useTranslation();
  const level = guessDirectionLevel(value);
  const { variant, label } = DIRECTION_BADGES[level];
  return (
    <Badge
      bg={variant}
      title={`${t("puzzle.answerOrGuess.direction", "Solve direction")}: ${formatGuessDirection(value)}`}
    >
      {t(`puzzle.answerOrGuess.directionBadge.${level}`, label)}
    </Badge>
  );
};

const GuessConfidenceBadge = ({
  value,
}: {
  value: GuessType["confidence"];
}) => {
  const { t } = useTranslation();
  const level = guessConfidenceLevel(value);
  const { variant, label } = CONFIDENCE_BADGES[level];
  return (
    <Badge
      bg={variant}
      title={`${t("puzzle.answerOrGuess.confidence", "Confidence")}: ${formatConfidence(value)}`}
    >
      {t(`puzzle.answerOrGuess.confidenceLevel.${level}`, label)}
    </Badge>
  );
};

export {
  formatConfidence,
  formatGuessDirection,
  GuessConfidenceBadge,
  GuessDirectionBadge,
  guessConfidenceLevel,
  guessDirectionLevel,
};
