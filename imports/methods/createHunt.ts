import { Match } from "meteor/check";
import { HuntPattern } from "../lib/models/Hunts";
import TypedMethod from "./TypedMethod";

export const CreateHuntPayloadSchema = {
  ...HuntPattern,
  initialTags: Match.Optional(String),
};

interface CreateHuntPayload {
  name: string;
  mailingLists?: string[];
  description?: string;
  isOpenSignups?: boolean;
  homepageUrl?: string;
  gdriveHostId?: string;
  githubHostId?: string;
  discordHostId?: string;
  initialTags?: string;
}

export default new TypedMethod<CreateHuntPayload & Record<string, any>, string>(
  "Hunts.methods.create",
);
