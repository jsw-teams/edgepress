// Renderer verification only: never added to a site's content or generated routes.
export const markdownFixture = [
  '## Heading two', '### Heading three', '#### Heading four', '##### Heading five', '###### Heading six', '',
  'Setext heading level two', '------------------------', '',
  'A paragraph with a hard break.  ', 'The next line.', '',
  '---', '', '***', '', '___', '',
  '*Emphasis* and **strong emphasis** with ~~strikethrough~~.', '',
  'Inline `code`.', '', '```js', 'console.log("fixture");', '```', '',
  '~~~text', 'Plain fenced code.', '~~~', '', '    const indented = true;', '',
  '`` ` ``', '', '\\*escaped punctuation\\* &lt; &amp;', '',
  '[Inline](/quick-start/) and [reference][guide].', '', '[guide]: /quick-start/', '',
  'https://www.markdownguide.org/', '', '<https://commonmark.org> www.example.com <team@example.com>', '',
  '![An illustrated Markdown guide](/edgepress-markdown-guide.png)', '',
  '![A kite crossing a field](https://media.example.org/field-recording.mp4 "Wind test")', '',
  '- **Formatted** item', '    1. Nested ordered item', '',
  '- [x] Completed task', '- [ ] Pending task', '',
  '> - A list in a quotation', '>   - Another item', '', '> Outer quotation', '>', '> > Nested quotation', '',
  '| Heading | Value |', '| --- | --- |', '| *Emphasis* | Detail |', '',
  'Use <kbd>Ctrl</kbd>.', '', '<script>alert("unsafe")</script>'
].join('\n');
