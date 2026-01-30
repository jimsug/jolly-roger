import type { Meteor } from "meteor/meteor";
import Badge from "react-bootstrap/Badge";
import ListGroup from "react-bootstrap/ListGroup";
import ListGroupItem from "react-bootstrap/ListGroupItem";
import { Link } from "react-router-dom";
import styled from "styled-components";
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

const InvitedUserList = ({
  users,
  hunts,
}: {
  users: Meteor.User[];
  hunts?: Record<string, string>;
}) => {
  return (
    <ListGroup>
      {users.map((user) => {
        return (
          <ListGroupItem key={user._id} className="p-1">
            <ListItemContainer>
              {user.services.password.enroll.email}
              <RightItems>
                {hunts && user.hunts?.[0] && (
                  <Badge
                    as={Link}
                    bg="info"
                    to={`/hunts/${user.hunts[0]}/hunters/invite`}
                  >
                    {hunts[user.hunts[0]]}
                  </Badge>
                )}
                Last invited
                <RelativeTime
                  date={user.services.password.enroll.when}
                  minimumUnit="minute"
                  key={`user-${user._id}-invite-time`}
                  maxElements={2}
                />
              </RightItems>
            </ListItemContainer>
          </ListGroupItem>
        );
      })}
    </ListGroup>
  );
};
export default InvitedUserList;
