import type { EditableHuntType } from "../lib/models/Hunts";
import TypedMethod from "./TypedMethod";

export type CreateHuntPayload = EditableHuntType & {
  // Comma-separated tag names to create alongside the hunt. When omitted the
  // server creates its default set; an empty string creates none.
  initialTags?: string;
};

export default new TypedMethod<CreateHuntPayload, string>(
  "Hunts.methods.create",
);
