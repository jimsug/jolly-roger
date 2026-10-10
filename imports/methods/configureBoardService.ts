import TypedMethod from "./TypedMethod";

// The service account's login, handed back the one time it's made (or its
// password rotated); Jolly Roger keeps only the hash.
export type BoardServiceCredentials = { email: string; password: string };

// Leave secret out to keep the one already stored. Returns the service
// account's credentials when this save created the account, else nothing.
export default new TypedMethod<
  { url: string; secret?: string },
  BoardServiceCredentials | undefined
>("Setup.methods.configureBoardService");
