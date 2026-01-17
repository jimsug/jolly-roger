import type { GdriveMimeTypesType } from "../lib/GdriveMimeTypes";
import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    huntId: string;
    title: string;
    url?: string;
    tags: string[];
    expectedAnswerCount: number;
    docType: GdriveMimeTypesType;
    allowDuplicateUrls?: boolean;
    locked?: boolean;
    lockedSummary?: string;
    completedWithNoAnswer?: boolean;
  },
  string
>("Puzzles.methods.create");
