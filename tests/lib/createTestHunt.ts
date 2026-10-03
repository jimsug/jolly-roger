import type { EditableHuntType } from "../../imports/lib/models/Hunts";
import Hunts from "../../imports/lib/models/Hunts";

// Inserts a bare hunt created by createdBy: the schema's defaults plus fields.
// Nobody is added to it, and it has no puzzles or tags (makeFixtureHunt is the
// one with those).
export default function createTestHunt(
  createdBy: string,
  fields: Partial<EditableHuntType> = {},
): Promise<string> {
  return Hunts.insertAsync({
    name: "Test hunt",
    hasGuessQueue: true,
    createdBy,
    ...fields,
  });
}
