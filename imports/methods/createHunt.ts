import type { EditableHuntType } from "../lib/models/Hunts";
import TypedMethod from "./TypedMethod";

export type CreateHuntPayload = EditableHuntType & {
  // Tag names to create alongside the hunt. When omitted the server creates
  // its default set; an empty list creates none.
  initialTags?: string[];
};

export default new TypedMethod<CreateHuntPayload, string>(
  "Hunts.methods.create",
);
