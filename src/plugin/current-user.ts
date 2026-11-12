// The acting author is always taken from Figma, never from a UI command.
// `figma` is passed in (not read as a global) so the module is testable and
// does not pull Figma typings into the UI program.

export interface CurrentUserHost {
  readonly currentUser: { readonly id: string | null } | null;
}

/** Returns `figma.currentUser.id`, or `null` when it is unavailable or empty. */
export function readCurrentUserId(host: CurrentUserHost): string | null {
  const id = host.currentUser?.id;
  return typeof id === 'string' && id !== '' ? id : null;
}
