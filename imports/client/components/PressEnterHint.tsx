import { Trans, useTranslation } from "react-i18next";

// The title goes in as a component rather than an interpolated value, so
// i18next neither escapes it nor parses it as markup.
const PressEnterHint = ({ title }: { title: string }) => {
  const { t } = useTranslation();
  return (
    <Trans
      i18nKey="puzzleList.pressEnterToOpen"
      t={t}
      defaults="Press <kbd>Enter</kbd> to go to <title/>"
      components={{ kbd: <kbd />, title: <strong>{title}</strong> }}
    />
  );
};

export default PressEnterHint;
