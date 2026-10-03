import TypedMethod from "./TypedMethod";

// Sets the server-wide comma-separated list of tags that new hunts start
// with. Leaving it unset falls back to the built-in list.
export default new TypedMethod<{ defaultHuntTags?: string }, void>(
  "Setup.methods.configureDefaultHuntTags",
);
