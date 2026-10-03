import crypto from "node:crypto";
import { Random } from "meteor/random";

// The TURN server details handed to a new transport, or undefined when there's
// no TURN server to use. urls is a JSON-encoded list, as Transports stores it.
export default function generateTurnConfig(
  env: NodeJS.ProcessEnv = process.env,
) {
  // $TURN_SERVER may list several servers, separated by commas
  const servers = (env.TURN_SERVER ?? "")
    .split(",")
    .map((server) => server.trim())
    .filter((server) => server !== "");
  if (servers.length === 0) {
    return undefined;
  }
  const urls = JSON.stringify(servers);

  // Hosted TURN services tend to hand out a fixed username and credential
  // rather than sharing a secret
  const turnUsername = env.TURN_USERNAME;
  const turnCredential = env.TURN_CREDENTIAL;
  if (turnUsername && turnCredential) {
    return {
      urls,
      username: turnUsername,
      credential: turnCredential,
    };
  }

  const turnSecret = env.TURN_SECRET;
  if (!turnSecret) {
    return undefined;
  }

  // Generate a username/credential that the TURN server will accept.

  // 3 days in seconds should be more than enough to get through hunt.
  // I sincerely doubt that any browser tab will be on a single call for that
  // long.
  const validityWindow = 3 * 24 * 60 * 60;
  const validUntil = Math.floor(Date.now() / 1000) + validityWindow;
  const nonce = Random.id();
  const username = `${validUntil}:${nonce}`;

  const hmac = crypto.createHmac("sha1", turnSecret);
  hmac.update(username);
  const credential = hmac.digest("base64");

  return {
    urls,
    username,
    credential,
  };
}
