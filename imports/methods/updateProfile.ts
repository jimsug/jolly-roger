import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    displayName: string;
    phoneNumber?: string;
    dingwords: string[];
    // Whether the user is hunting remotely. Only accepted from a logged-in
    // user editing their own profile.
    isOffsite?: boolean;
    // If provided, identifies the user by enrollment token instead of
    // requiring a logged-in session. This allows updateProfile to be called
    // before Accounts.resetPassword consumes the token, making the
    // enrollment flow resilient to method retries on connection drops.
    enrollmentToken?: string;
  },
  void
>("Users.methods.updateProfile");
