import type { TFunction } from "i18next";
import Badge from "react-bootstrap/Badge";
import { useTranslation } from "react-i18next";
import type { GuessType } from "../../lib/models/Guesses";

const formatGuessDirection = (value: GuessType["direction"], t: TFunction) => {
  if (value === undefined) {
    return t("puzzle.answerOrGuess.directionValue.unspecified", "Unspecified");
  }
  if (value === 0) {
    return t("puzzle.answerOrGuess.directionValue.neutral", "Neutral");
  }
  const amount = Math.abs(value);
  return value > 0
    ? t("puzzle.answerOrGuess.directionValue.forward", "Forward {{amount}}", {
        amount,
      })
    : t("puzzle.answerOrGuess.directionValue.back", "Back {{amount}}", {
        amount,
      });
};

const formatConfidence = (value: GuessType["confidence"], t: TFunction) => {
  if (value === undefined) {
    return t("puzzle.answerOrGuess.confidenceValue.unspecified", "Unspecified");
  }
  return t("puzzle.answerOrGuess.confidenceValue.percent", "{{percent}}%", {
    percent: value,
  });
};

// One level of a guess's direction or confidence: the value the guess modal
// stores for it, the badge that shows it and the modal's toggle that picks
// it. key and label are the translation key and its English default.
type GuessLevel<Level extends string> = {
  level: Level;
  value: number;
  badge: { variant: string; text?: "dark"; key: string; label: string };
  toggle: { variant: string; key: string; label: string };
};

// Back to forward, in the order the guess modal lists them
const GUESS_DIRECTION_LEVELS: readonly [
  GuessLevel<"back">,
  GuessLevel<"mostlyBack">,
  GuessLevel<"mixed">,
  GuessLevel<"mostlyForward">,
  GuessLevel<"forward">,
] = [
  {
    level: "back",
    value: -10,
    badge: {
      variant: "danger",
      key: "puzzle.answerOrGuess.directionLevel.back",
      label: "Back",
    },
    toggle: {
      variant: "outline-secondary",
      key: "puzzle.answerOrGuess.directionOption.backsolve",
      label: "Backsolve",
    },
  },
  {
    level: "mostlyBack",
    value: -5,
    badge: {
      variant: "danger",
      key: "puzzle.answerOrGuess.directionLevel.mostlyBack",
      label: "Back*",
    },
    toggle: {
      variant: "outline-secondary",
      key: "puzzle.answerOrGuess.directionOption.mostlyBack",
      label: "Mostly back",
    },
  },
  {
    level: "mixed",
    value: 0,
    badge: {
      variant: "secondary",
      key: "puzzle.answerOrGuess.directionLevel.mixed",
      label: "Mixed",
    },
    toggle: {
      variant: "outline-secondary",
      key: "puzzle.answerOrGuess.directionOption.mixed",
      label: "Mixed",
    },
  },
  {
    level: "mostlyForward",
    value: 5,
    badge: {
      variant: "primary",
      key: "puzzle.answerOrGuess.directionLevel.mostlyForward",
      label: "Forward*",
    },
    toggle: {
      variant: "outline-secondary",
      key: "puzzle.answerOrGuess.directionOption.mostlyForward",
      label: "Mostly forward",
    },
  },
  {
    level: "forward",
    value: 10,
    badge: {
      variant: "primary",
      key: "puzzle.answerOrGuess.directionLevel.forward",
      label: "Forward",
    },
    toggle: {
      variant: "outline-primary",
      key: "puzzle.answerOrGuess.directionOption.forwardsolve",
      label: "Forwardsolve",
    },
  },
];

// Low to high, in the order the guess modal lists them
const GUESS_CONFIDENCE_LEVELS: readonly [
  GuessLevel<"low">,
  GuessLevel<"medium">,
  GuessLevel<"high">,
] = [
  {
    level: "low",
    value: 0,
    badge: {
      variant: "danger",
      key: "puzzle.answerOrGuess.confidenceLevel.low",
      label: "Low",
    },
    toggle: {
      variant: "outline-danger",
      key: "puzzle.answerOrGuess.confidenceLevel.low",
      label: "Low",
    },
  },
  {
    level: "medium",
    value: 50,
    // White on yellow is too faint to read
    badge: {
      variant: "warning",
      text: "dark",
      key: "puzzle.answerOrGuess.confidenceLevel.medium",
      label: "Medium",
    },
    toggle: {
      variant: "outline-warning",
      key: "puzzle.answerOrGuess.confidenceLevel.medium",
      label: "Medium",
    },
  },
  {
    level: "high",
    value: 100,
    badge: {
      variant: "success",
      key: "puzzle.answerOrGuess.confidenceLevel.high",
      label: "High",
    },
    toggle: {
      variant: "outline-success",
      key: "puzzle.answerOrGuess.confidenceLevel.high",
      label: "High",
    },
  },
];

// The stored direction (-10 to 10) as one of five levels. An unset direction
// reads as mixed.
const levelForDirection = (value: GuessType["direction"] = 0) => {
  const [back, mostlyBack, mixed, mostlyForward, forward] =
    GUESS_DIRECTION_LEVELS;
  if (value > 5) {
    return forward;
  }
  if (value > 0) {
    return mostlyForward;
  }
  if (value < -5) {
    return back;
  }
  if (value < 0) {
    return mostlyBack;
  }
  return mixed;
};

const guessDirectionLevel = (value: GuessType["direction"]) =>
  levelForDirection(value).level;

// The stored confidence (0 to 100) as one of three levels. An unset
// confidence reads as medium.
const levelForConfidence = (value: GuessType["confidence"] = 50) => {
  const [low, medium, high] = GUESS_CONFIDENCE_LEVELS;
  if (value > 50) {
    return high;
  }
  if (value < 50) {
    return low;
  }
  return medium;
};

const guessConfidenceLevel = (value: GuessType["confidence"]) =>
  levelForConfidence(value).level;

const GuessDirectionBadge = ({ value }: { value: GuessType["direction"] }) => {
  const { t } = useTranslation();
  const { variant, text, key, label } = levelForDirection(value).badge;
  return (
    <Badge
      bg={variant}
      text={text}
      title={t(
        "puzzle.answerOrGuess.directionTitle",
        "Solve direction: {{direction}}",
        {
          direction: formatGuessDirection(value, t),
          // The title is set as plain text, so HTML escaping would only show
          // entities; this goes once both i18n inits turn escapeValue off
          interpolation: { escapeValue: false },
        },
      )}
    >
      {t(key, label)}
    </Badge>
  );
};

const GuessConfidenceBadge = ({
  value,
}: {
  value: GuessType["confidence"];
}) => {
  const { t } = useTranslation();
  const { variant, text, key, label } = levelForConfidence(value).badge;
  return (
    <Badge
      bg={variant}
      text={text}
      title={t(
        "puzzle.answerOrGuess.confidenceTitle",
        "Confidence: {{confidence}}",
        {
          confidence: formatConfidence(value, t),
          // The title is set as plain text, so HTML escaping would only show
          // entities; this goes once both i18n inits turn escapeValue off
          interpolation: { escapeValue: false },
        },
      )}
    >
      {t(key, label)}
    </Badge>
  );
};

export {
  formatConfidence,
  formatGuessDirection,
  GUESS_CONFIDENCE_LEVELS,
  GUESS_DIRECTION_LEVELS,
  GuessConfidenceBadge,
  GuessDirectionBadge,
  guessConfidenceLevel,
  guessDirectionLevel,
};
