import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { calendarTimeFormat } from "../../lib/calendarTimeFormat";

const Mark = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// Shows that a chat message has been edited since it was sent, with when in
// its title.
const EditedMark = ({
  editedAt,
  className,
}: {
  editedAt: Date;
  className?: string;
}) => {
  const { t, i18n } = useTranslation();
  return (
    <Mark
      className={className}
      title={t("chat.editedAt", "Edited {{time}}", {
        time: calendarTimeFormat(editedAt, t, i18n.language),
        // The time lands in a title attribute, which React escapes, so
        // i18next's escaping would only show entities
        interpolation: { escapeValue: false },
      })}
    >
      {t("chat.edited", "(edited)")}
    </Mark>
  );
};

export default EditedMark;
