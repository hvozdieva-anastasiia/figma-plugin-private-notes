import { describe, expect, it } from 'vitest';
import { readCopiedCommentLink } from '../../experiments/native-comment-navigation/comment-link';

describe('copied Figma comment links for the navigation experiment', () => {
  const syntheticLink =
    'https://www.figma.com/design/ExampleFile/Example?node-id=12-34#123456789';

  it('preserves the exact supplied query and comment fragment', () => {
    expect(readCopiedCommentLink(syntheticLink)).toBe(syntheticLink);
  });

  it('accepts the older file route without rewriting it', () => {
    const link = 'https://figma.com/file/ExampleFile/Example#123456789';
    expect(readCopiedCommentLink(link)).toBe(link);
  });

  it('allows surrounding whitespace from copying', () => {
    expect(readCopiedCommentLink(` ${syntheticLink}\n`)).toBe(syntheticLink);
  });

  it.each([
    undefined,
    null,
    123,
    { url: syntheticLink },
    'javascript:alert(1)',
    'http://www.figma.com/design/ExampleFile/Example#123',
    'https://figma.com.example.org/design/ExampleFile/Example#123',
    'https://figma.com@evil.example/design/ExampleFile/Example#123',
    'https://www.figma.com/design/ExampleFile/Example?node-id=12-34',
    'https://www.figma.com/design/ExampleFile/Example#not-a-comment-id',
    'https://www.figma.com\\@evil.example/design/ExampleFile/Example#123',
    'https://www.figma.com/design/ExampleFile/Example\n#123',
  ])('rejects unsupported or ambiguous input %j', (input) => {
    expect(readCopiedCommentLink(input)).toBeNull();
  });
});
