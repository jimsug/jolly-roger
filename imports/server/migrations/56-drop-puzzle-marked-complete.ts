import dropPuzzleMarkedComplete from "../dropPuzzleMarkedComplete";
import Migrations from "./Migrations";

Migrations.add({
  version: 56,
  name: "Drop markedComplete from puzzles, keeping their solvedness",
  async up() {
    await dropPuzzleMarkedComplete();
  },
});
