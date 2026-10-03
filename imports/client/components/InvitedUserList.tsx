import type { Meteor } from "meteor/meteor";
import Badge from "react-bootstrap/Badge";
import ListGroup from "react-bootstrap/ListGroup";
import ListGroupItem from "react-bootstrap/ListGroupItem";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import styled from "styled-components";
import { pendingEnrollment } from "../../lib/models/User";
import RelativeTime from "./RelativeTime";

const ListItemContainer = styled.div`
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
`;

const RightItems = styled.div`
  margin-left: auto;
  padding-right: 0.5rem;

  * {
    margin: 0 0.25rem;
  }
`;

// Lists users with a pending enrollment (invited, but not yet signed up).
// `huntNames` (hunt id -> name) adds a badge linking to the invite page of
// the hunt each user was invited to; omit it when the list is already
// scoped to a single hunt.
const InvitedUserList = ({
  users,
  huntNames,
}: {
  users: Meteor.User[];
  huntNames?: Record<string, string>;
}) => {
  const { t } = useTranslation();

  return (
    <ListGroup>
      {users.map((user) => {
        const enrollment = pendingEnrollment(user);
        const huntId = user.hunts?.[0];
        return (
          <ListGroupItem key={user._id} className="p-1">
            <ListItemContainer>
              {enrollment?.email ?? user._id}
              <RightItems>
                {huntNames && huntId && (
                  <Badge
                    as={Link}
                    bg="info"
                    to={`/hunts/${huntId}/hunters/invite`}
                  >
                    {huntNames[huntId] ?? huntId}
                  </Badge>
                )}
                {enrollment?.when && (
                  <>
                    {t("invitedUsers.lastInvited", "Last invited")}{" "}
                    <RelativeTime
                      date={enrollment.when}
                      minimumUnit="minute"
                      maxElements={2}
                    />
                  </>
                )}
              </RightItems>
            </ListItemContainer>
          </ListGroupItem>
        );
      })}
    </ListGroup>
  );
};

export default InvitedUserList;
