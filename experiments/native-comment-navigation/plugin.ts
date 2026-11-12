import { readCopiedCommentLink } from './comment-link';

figma.parameters.on('input', ({ query, result }) => {
  const link = readCopiedCommentLink(query);
  result.setSuggestions(
    link ? [{ name: 'Открыть скопированную ссылку', data: link }] : [],
  );
  if (query && !link) {
    result.setError(
      'Вставьте ссылку из меню комментария Figma с числовым #ID.',
    );
  }
});

figma.on('run', ({ parameters }) => {
  const link = readCopiedCommentLink(parameters?.commentUrl);
  if (!link) {
    figma.closePlugin('Нужна ссылка, скопированная из меню комментария Figma.');
    return;
  }
  try {
    figma.openExternal(link);
    figma.closePlugin(
      'Ссылка передана браузеру. Раскрытие ветки проверьте в Figma.',
    );
  } catch {
    figma.closePlugin('Figma не удалось передать ссылку браузеру.');
  }
});
