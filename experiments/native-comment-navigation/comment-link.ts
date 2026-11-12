// This experiment accepts the copied link format observed in the pilot.
// It deliberately does not guess or synthesize Figma comment URLs.
const copiedCommentLink =
  /^https:\/\/(?:www\.)?figma\.com\/(?:design|file)\/[A-Za-z0-9]+(?:\/[^?#\s\\]*)?(?:\?[^#\s\\]*)?#[0-9]+$/;

export function readCopiedCommentLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const link = value.trim();
  return copiedCommentLink.test(link) ? link : null;
}
