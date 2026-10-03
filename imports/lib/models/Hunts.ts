import { Match } from "meteor/check";
import { z } from "zod";
import { nonEmptyString, snowflake } from "../typedModel/customTypes";
import type { ModelType } from "../typedModel/Model";
import { Url } from "../typedModel/regexes";
import SoftDeletedModel from "../typedModel/SoftDeletedModel";
import withCommon from "../typedModel/withCommon";

export const SavedDiscordObjectFields = z.object({
  id: snowflake,
  name: nonEmptyString,
});

export type SavedDiscordObjectType = z.infer<typeof SavedDiscordObjectFields>;

// Roles a hunt may grant to every member by default (Hunts.defaultRoles).
export const HUNT_DEFAULT_ROLES = ["operator"] as const;
export type HuntDefaultRole = (typeof HUNT_DEFAULT_ROLES)[number];

const EditableHunt = z.object({
  name: nonEmptyString,
  // Everyone that joins the hunt will be added to these mailing lists
  mailingLists: nonEmptyString.array().default([]),
  // This message is displayed (as markdown) to users that are not members of
  // this hunt. It should include instructions on how to join
  signupMessage: nonEmptyString.optional(),
  // This message is displayed (as markdown) at the top of the hunt's More
  // page. It's a good place for links to resources and other static
  // information about the hunt.
  moreInfo: nonEmptyString.optional(),
  // If this is true, then any member of this hunt is allowed to add others to
  // it. Otherwise, you must be an admin to add someone to the hunt.
  openSignups: z.boolean().default(false),
  // If this is true, an operator must mark guesses as correct or not.
  // If this is false, users enter answers directly without the guess step.
  hasGuessQueue: z.boolean(),
  // Every member of this hunt is treated as having these roles without the
  // roles being written to their accounts.
  defaultRoles: z.enum(HUNT_DEFAULT_ROLES).array().default([]),
  // If this is true, puzzles in this hunt may be created in a locked state,
  // with members voting on which to unlock.
  allowUnlockablePuzzles: z.boolean().default(false),
  // If provided, users will be presented with this text as a modal to agree to
  // before accessing the hunt.
  termsOfUse: nonEmptyString.optional(),
  // If this is provided, then this is used to generate links to puzzles' guess
  // submission pages. The format is interpreted as a Mustache template
  // (https://mustache.github.io/). It's passed as context a parsed URL
  // (https://nodejs.org/api/url.html#url_class_url), which provides variables
  // like "host" and "pathname".
  submitTemplate: nonEmptyString.optional(),
  // If provided, then this is a link to the overall root hunt homepage and will
  // be shown in the PuzzleListPage navbar.
  homepageUrl: z.string().regex(Url).optional(),
  // If this is true, the hunt is listed below active hunts on the hunt list.
  // Archived hunts otherwise behave normally.
  isArchived: z.boolean().default(false),
  // If provided, this replaces homepageUrl as the hunt link in the navbar,
  // e.g. when the hunt site has moved to an archive after the event.
  archivedHuntUrl: z.string().regex(Url).optional(),
  // If provided (along with customLinkName), an extra link is shown in the
  // hunt navbar. With customLinkEmbed set, the page is embedded in Jolly
  // Roger rather than opened in a new tab.
  customLinkUrl: z.string().regex(Url).optional(),
  customLinkName: nonEmptyString.optional(),
  customLinkEmbed: z.boolean().default(false),
  // If provided, then announcements will be synced to this Discord channel
  announcementDiscordChannel: SavedDiscordObjectFields.optional(),
  // If provided, this is an object containing a Discord channel id and cached
  // channel name (for local presentation) to which we should post puzzle
  // creation messages as the server-configured Discord bot. If unset, those
  // messages go to puzzleHooksDiscordChannel.
  puzzleCreationDiscordChannel: SavedDiscordObjectFields.optional(),
  // If provided, this is an object containing a Discord channel id and cached
  // channel name (for local presentation) to which we should post puzzle
  // solve messages as the server-configured Discord bot.
  puzzleHooksDiscordChannel: SavedDiscordObjectFields.optional(),
  // If provided, then any message sent in chat for a puzzle associated with
  // this hunt will be mirrored to the specified Discord channel.
  firehoseDiscordChannel: SavedDiscordObjectFields.optional(),
  // If provided, then members of the hunt who have also linked their Discord
  // profile will be added to this role.
  memberDiscordRole: SavedDiscordObjectFields.optional(),
});
export type EditableHuntType = z.infer<typeof EditableHunt>;
const Hunt = withCommon(EditableHunt);

const SavedDiscordObjectPattern = {
  id: String,
  name: String,
};

export const HuntPattern = {
  name: String,
  mailingLists: [String] as [StringConstructor],
  signupMessage: Match.Optional(String),
  moreInfo: Match.Optional(String),
  openSignups: Boolean,
  hasGuessQueue: Boolean,
  defaultRoles: [Match.OneOf(...HUNT_DEFAULT_ROLES)] as [
    Match.Matcher<HuntDefaultRole>,
  ],
  allowUnlockablePuzzles: Boolean,
  termsOfUse: Match.Optional(String),
  submitTemplate: Match.Optional(String),
  homepageUrl: Match.Optional(String),
  isArchived: Boolean,
  archivedHuntUrl: Match.Optional(String),
  customLinkUrl: Match.Optional(String),
  customLinkName: Match.Optional(String),
  customLinkEmbed: Boolean,
  announcementDiscordChannel: Match.Optional(SavedDiscordObjectPattern),
  puzzleCreationDiscordChannel: Match.Optional(SavedDiscordObjectPattern),
  puzzleHooksDiscordChannel: Match.Optional(SavedDiscordObjectPattern),
  firehoseDiscordChannel: Match.Optional(SavedDiscordObjectPattern),
  memberDiscordRole: Match.Optional(SavedDiscordObjectPattern),
};

const Hunts = new SoftDeletedModel("jr_hunts", Hunt);
export type HuntType = ModelType<typeof Hunts>;

export default Hunts;
