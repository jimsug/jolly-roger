import express from "express";
import authenticator from "./api/authenticator";
import hunts from "./api/resources/hunts";
import updatePuzzleNote from "./api/resources/updatePuzzleNote";
import users from "./api/resources/users";

const api = express();

// Routes mounted here answer without an API key. Only the puzzle-note
// endpoint lives here: a script attached to a puzzle's Google Sheet posts the
// sheet's notes and identifies the puzzle by hunt id and document id, and it
// has no way to hold a key. Anyone who knows those two ids can rewrite the
// notes of that puzzle, so keep this router to endpoints with that risk
// profile.
const publicApi = express.Router();
publicApi.use("/updatePuzzleNote", updatePuzzleNote);
api.use(publicApi);

api.use(authenticator);
api.use("/users", users);
api.use("/hunts", hunts);

export default api;
