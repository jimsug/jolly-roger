import TypedPublication from "./TypedPublication";

const tagsForHunt = new TypedPublication<{
  huntId: string;
}>("tagsForHunt");

export default tagsForHunt;
