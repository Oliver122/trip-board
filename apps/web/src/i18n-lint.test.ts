import { Linter } from 'eslint'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import rule from '../eslint/no-untranslated-jsx-text.js'

const linter = new Linter({ configType: 'flat' })
const filename = fileURLToPath(new URL('./sample.jsx', import.meta.url))

describe('no-untranslated-jsx-text', () => {
  it('T-03-02 flags a JSX string literal that is not a translation call', () => {
    const literal = verify('export function Bad(){ return <p>Hello</p> }')
    expect(literal.map((message) => message.message)).toEqual([
      'JSX string literal must be a translation call.',
    ])

    const expression = verify(
      'export function Bad(){ return <p>{"Hello"}</p> }',
    )
    expect(expression).toHaveLength(1)

    const translated = verify(
      'export function Good(){ return <p>{t("hello")}</p> }',
    )
    expect(translated).toEqual([])
  })
})

function verify(code: string) {
  return linter.verify(
    code,
    [
      {
        plugins: {
          tripboard: {
            rules: {
              'no-untranslated-jsx-text': rule,
            },
          },
        },
        files: ['**/*.jsx'],
        languageOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        rules: {
          'tripboard/no-untranslated-jsx-text': 'error',
        },
      },
    ],
    { filename },
  )
}
