import { parser } from '../grammar/parser'
import { cellmlHighlight } from '../grammar/highlight'
import { LRLanguage, LanguageSupport, foldNodeProp, foldInside, indentNodeProp } from '@codemirror/language'
// import { styleTags, tags as t } from '@lezer/highlight'
// 
// Configure the Parser with Metadata
// We attach the highlight styles and code folding logic here
const cellmlParser = parser.configure({
  props: [
    // Attach your highlighting rules
    cellmlHighlight,

    // Add code folding for blocks (optional but recommended)
    foldNodeProp.add({
      'Definition Model Units': foldInside,
      Annotations: foldInside,
    }),

    // Add auto-indentation logic (optional)
    indentNodeProp.add({
      'Definition Model Units': (context) => {
        const child = context.node.firstChild
        return child ? context.column(child.from) + 2 : context.node.from + 2
      },
      Annotations: (context) => {
        const child = context.node.firstChild
        return child ? context.column(child.from) + 2 : context.node.from + 2
      },
    }),
  ],
})

// Define the Language
export const cellmlLanguage = LRLanguage.define({
  parser: cellmlParser,
  languageData: {
    commentTokens: { line: '//' },
  },
})

// 3. Export the Extension Function
export function cellml() {
  return new LanguageSupport(cellmlLanguage)
}
