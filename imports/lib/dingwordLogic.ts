import type { Meteor } from "meteor/meteor";
import type { ChatMessageType } from "./models/ChatMessages";
import nodeIsMention from "./nodeIsMention";
import nodeIsRoleMention from "./nodeIsRoleMention";
import nodeIsText from "./nodeIsText";
import { listAllRolesForHunt } from "./permission_stubs";

type NeededChatFields = "content" | "sender" | "hunt";
type PartialChatMessageType = Pick<ChatMessageType, NeededChatFields>;

// Stored in a user's suppressedDingwords[hunt][puzzle] list to mute every
// dingword on that puzzle, not just one.
export const SUPPRESS_ALL_DINGWORDS = "__ALL__";

// Lowercases text and collapses runs of whitespace, so a dingword normalised
// the same way can be found in it with a plain substring search.
export function normalizeDingwordText(text: string): string {
  return text.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

export function normalizedForDingwordSearch(
  chatMessage: PartialChatMessageType,
): string {
  return normalizeDingwordText(
    chatMessage.content?.children
      .map((child) => {
        if (nodeIsText(child)) {
          return child.text;
        } else {
          // No need to look for dingwords in @-mentions, but let them split words
          return " ";
        }
      })
      .join("") ?? "",
  );
}

// A word character for the purpose of dingword boundaries: letters, digits
// and underscore, in any script. Both are sticky so they test one position
// of the message rather than scanning it.
const WORD_CHAR_BEFORE = /(?<=[\p{L}\p{N}_])/uy;
const WORD_CHAR_AT = /[\p{L}\p{N}_]/uy;

function wordCharBefore(text: string, index: number): boolean {
  WORD_CHAR_BEFORE.lastIndex = index;
  return WORD_CHAR_BEFORE.test(text);
}

function wordCharAt(text: string, index: number): boolean {
  WORD_CHAR_AT.lastIndex = index;
  return WORD_CHAR_AT.test(text);
}

// Whether a normalised dingword appears in the normalised message. The
// dingword must start at a word boundary; in the default mode it must end at
// one too, while "open match" lets it match the start of a longer word
// ("logic" dings on "logician").
function dingwordAppears(
  message: string,
  dingword: string,
  openMatch: boolean | undefined,
): boolean {
  for (
    let start = message.indexOf(dingword);
    start !== -1;
    start = message.indexOf(dingword, start + 1)
  ) {
    if (
      !wordCharBefore(message, start) &&
      (openMatch || !wordCharAt(message, start + dingword.length))
    ) {
      return true;
    }
  }
  return false;
}

// Returns the dingwords that appear in the message, so callers can tell the
// user which word dinged them (and offer to mute it).
export function normalizedMessageDingsUserByDingword(
  normalizedMessage: string,
  user: Pick<Meteor.User, "dingwords" | "dingwordsOpenMatch">,
): string[] {
  return (user.dingwords ?? []).filter((dingword) => {
    const normalized = normalizeDingwordText(dingword);
    return (
      normalized !== "" &&
      dingwordAppears(normalizedMessage, normalized, user.dingwordsOpenMatch)
    );
  });
}

export function dingedByMentions(
  chatMessage: PartialChatMessageType,
  user: Pick<Meteor.User, "_id">,
): boolean {
  return (chatMessage.content?.children ?? []).some((child) => {
    if (nodeIsMention(child)) {
      return child.userId === user._id;
    } else {
      return false;
    }
  });
}

export function dingedByRoleMentions(
  chatMessage: PartialChatMessageType,
  user: Meteor.User,
  // Pass the hunt document to honour its default roles
  hunt?: Parameters<typeof listAllRolesForHunt>[1],
): boolean {
  const roles = listAllRolesForHunt(user, hunt ?? { _id: chatMessage.hunt });
  return (chatMessage.content?.children ?? []).some((child) => {
    if (nodeIsRoleMention(child)) {
      return roles.includes(child.roleId);
    } else {
      return false;
    }
  });
}

export function messageDingsUser(
  chatMessage: PartialChatMessageType,
  user: Meteor.User,
): boolean {
  if (chatMessage.sender === user._id || chatMessage.sender === undefined) {
    // You can never be dinged by yourself, nor by system messages.
    return false;
  }
  const normalizedText = normalizedForDingwordSearch(chatMessage);
  const dingedByDingwords =
    normalizedMessageDingsUserByDingword(normalizedText, user).length > 0;
  return (
    dingedByDingwords ||
    dingedByMentions(chatMessage, user) ||
    dingedByRoleMentions(chatMessage, user)
  );
}
