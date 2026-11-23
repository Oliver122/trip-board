// R-48-03: no `.only` in a test, and no unconditional skip. A skip that takes
// a condition (`test.skip(cond, 'why')`, `test.skip(({ browserName }) => …)`)
// is allowed; a title string plus a body, or no arguments, is not.
const ROOTS = new Set(['test', 'it', 'describe'])
const SKIPS = new Set(['skip', 'fixme'])

// The member chain of `test.describe.only`: ['test', 'describe', 'only'].
function chain(node) {
  const names = []
  let n = node
  while (n.type === 'MemberExpression' && !n.computed) {
    names.unshift(n.property.name)
    n = n.object
  }
  if (n.type !== 'Identifier') return null
  names.unshift(n.name)
  return names
}

const isTitle = (arg) =>
  arg &&
  ((arg.type === 'Literal' && typeof arg.value === 'string') ||
    arg.type === 'TemplateLiteral')

export default {
  meta: {
    type: 'problem',
    messages: {
      only: 'Remove `.only`: it silently skips every other test.',
      skip: 'Unconditional `{{name}}`: delete the test or make the skip conditional.',
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.computed || node.property.name !== 'only') return
        const names = chain(node)
        if (names && ROOTS.has(names[0])) {
          context.report({ node: node.property, messageId: 'only' })
        }
      },
      CallExpression(node) {
        const names = chain(node.callee)
        if (!names || names.length < 2 || !ROOTS.has(names[0])) return
        if (!SKIPS.has(names[names.length - 1])) return
        const [first] = node.arguments
        if (first === undefined || isTitle(first)) {
          context.report({
            node,
            messageId: 'skip',
            data: { name: names.join('.') },
          })
        }
      },
    }
  },
}
