import { createHmac } from "node:crypto";
import { Meteor } from "meteor/meteor";
import Flags from "../Flags";
import Logger from "../Logger";
import type { BoardDocumentType } from "../lib/models/Documents";
import Documents from "../lib/models/Documents";
import type { HuntType } from "../lib/models/Hunts";
import Settings from "../lib/models/Settings";
import { Url } from "../lib/typedModel/regexes";
import withLock from "./withLock";

// The board service as a document provider: Jolly Roger asks it to create a
// board for a scope (a hunt, or a puzzle in a hunt) over its HTTP API with
// the shared secret, keeps the board's id and page url as a Document, and
// signs short-lived tokens that say who is looking at the board and what
// they may do. The service verifies the token and applies its own policy
// on top; nothing of what's on the board comes back here.

export interface BoardScope {
  hunt: string;
  puzzle?: string;
}

export interface BoardClaims {
  v: 1;
  scope: BoardScope;
  user: string;
  name: string;
  // Whether the viewer may edit at all. The service can narrow this (an
  // operators-only board, say) but never widen it.
  mayEdit: boolean;
  // Whether the viewer counts as an operator of the hunt, by assignment or
  // by the hunt's default roles: who may edit under an operators-only policy
  operator: boolean;
  // Whether the viewer is an assigned operator or an admin: who may change
  // the edit policy and lock the layout
  assignedOperator: boolean;
  // Milliseconds since the epoch
  exp: number;
}

export const BOARD_TOKEN_LIFETIME_MS = 5 * 60 * 1000;

export type BoardService = Extract<
  Awaited<ReturnType<typeof Settings.findOneAsync>>,
  { name: "board.service" }
>["value"];

// The configured service, or undefined while the feature is off or unset
export async function boardService(): Promise<BoardService | undefined> {
  if (await Flags.activeAsync("disable.board")) return undefined;
  const setting = await Settings.findOneAsync({ name: "board.service" });
  return setting?.value;
}

export async function requireBoardService(): Promise<BoardService> {
  const service = await boardService();
  if (!service) {
    throw new Meteor.Error(400, "The board service isn't set up");
  }
  return service;
}

const base64url = (bytes: Buffer) => bytes.toString("base64url");

// <base64url(JSON claims)>.<base64url(HMAC-SHA256(that, secret))>, as the
// service verifies it
export function signBoardToken(claims: BoardClaims, secret: string): string {
  const payload = base64url(Buffer.from(JSON.stringify(claims), "utf8"));
  const signature = createHmac("sha256", secret).update(payload).digest();
  return `${payload}.${base64url(signature)}`;
}

export function boardScope(huntId: string, puzzleId?: string): BoardScope {
  return puzzleId ? { hunt: huntId, puzzle: puzzleId } : { hunt: huntId };
}

// The hunt's board, or the puzzle's when a puzzle is given
export function findBoard(scope: BoardScope) {
  return Documents.findOneAsync({
    hunt: scope.hunt,
    provider: "board",
    puzzle: scope.puzzle ?? { $exists: false },
  });
}

async function serviceRequest(
  service: BoardService,
  method: "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${service.url}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${service.secret}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    Logger.warn("Board service unreachable", { method, path, error });
    throw new Meteor.Error(502, "The board service couldn't be reached");
  }
  return response;
}

// Asks the service for the scope's board. The service hands back the same
// board for the same scope, so asking twice is harmless.
async function createBoard(
  service: BoardService,
  scope: BoardScope,
): Promise<BoardDocumentType["value"]> {
  const response = await serviceRequest(service, "POST", "/boards", { scope });
  if (!response.ok) {
    Logger.warn("Board service refused to create a board", {
      scope,
      status: response.status,
    });
    throw new Meteor.Error(502, "The board service couldn't create the board");
  }
  const answer = (await response.json()) as { id?: unknown; url?: unknown };
  if (
    typeof answer.id !== "string" ||
    answer.id.length === 0 ||
    typeof answer.url !== "string" ||
    !Url.test(answer.url)
  ) {
    throw new Meteor.Error(502, "The board service gave an unusable answer");
  }
  return { id: answer.id, url: answer.url };
}

// The scope's board document, creating the board when there isn't one yet.
// Returns the document's id.
export async function ensureBoard(
  hunt: Pick<HuntType, "_id">,
  puzzleId?: string,
): Promise<string> {
  const service = await requireBoardService();
  const scope = boardScope(hunt._id, puzzleId);
  const existing = await findBoard(scope);
  if (existing) return existing._id;

  return withLock(`board:${hunt._id}:${puzzleId ?? "hunt"}`, async () => {
    const raced = await findBoard(scope);
    if (raced) return raced._id;
    Logger.info("Creating board", { scope });
    const value = await createBoard(service, scope);
    return Documents.insertAsync({
      hunt: hunt._id,
      ...(puzzleId ? { puzzle: puzzleId } : {}),
      provider: "board",
      value,
    });
  });
}
