export const strings = {
  home: {
    tagline: "One channel. No choices. Just listen.",
    signIn: "Sign in with Spotify",
    signingIn: "Signing in...",
  },
  radio: {
    tuningIn: "Tuning in...",
    errorTitle: "Something went wrong",
    errorBody: "The music will return. Try refreshing.",
  },
  errors: {
    state_mismatch:
      "Sign-in failed. Your browser may have blocked a cookie. Try again.",
    token_exchange: "Couldn't connect to Spotify. Try again.",
    access_denied: "Access was denied. You'll need to allow access to continue.",
    default: "Something went wrong. Please try again.",
  },
  attribution: "Spotify",
} as const;
