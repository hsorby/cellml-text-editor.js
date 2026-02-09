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
      'Definition Unit': foldInside,
    }),

    // Add auto-indentation logic for blocks.
    indentNodeProp.add({
      'Definition Unit': (context: any) => {
        const baseIndent = context.column(context.node.from)
        const lineText = context.textAfter.trim()
        if (lineText.startsWith('enddef;')) {
          return baseIndent
        }
        return baseIndent + context.unit
      },
    }),
  ],
})

// Define the Language
export const cellmlLanguage = LRLanguage.define({
  parser: cellmlParser,
  languageData: {
    commentTokens: { line: '//' },
    indentOnInput: /^\s*enddef;$/, // Helps with auto-indenting when typing 'enddef'
  },
})

// 3. Export the Extension Function
export function cellml() {
  return new LanguageSupport(cellmlLanguage)
}
