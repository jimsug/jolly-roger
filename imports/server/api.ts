import express from "express";
import authenticator from "./api/authenticator";
<<<<<<< HEAD
import updatePuzzleNote from "./api/resources/updatePuzzleNote";
=======
import createPuzzle from "./api/resources/createPuzzle";
import hunts from "./api/resources/hunts";
import tags from "./api/resources/tags";
>>>>>>> jpd/extension
import users from "./api/resources/users";

const api = express();

const publicApi = express.Router();
publicApi.use("/updatePuzzleNote", updatePuzzleNote);

api.use(publicApi);
api.use(authenticator);
api.use("/users", users);
api.use("/hunts", hunts);
api.use("/tags", tags);
api.use("/createPuzzle", createPuzzle);

export default api;
