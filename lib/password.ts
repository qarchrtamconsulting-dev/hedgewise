/** Returns a problem message, or null if the new password is OK. */
export function checkNewPassword(pw: string, confirm: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (pw !== confirm) return "The two passwords don't match.";
  return null;
}
