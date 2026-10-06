/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow JSX string literals that are not passed through a translation call',
    },
    messages: {
      literal: 'JSX string literal must be a translation call.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXText(node) {
        if (!visible(node.value)) return
        context.report({ node, messageId: 'literal' })
      },
      JSXExpressionContainer(node) {
        const parent = node.parent
        if (
          !parent ||
          (parent.type !== 'JSXElement' && parent.type !== 'JSXFragment')
        ) {
          return
        }
        inspect(node.expression, context)
      },
    }
  },
}

/**
 * @param {import('estree').Node | null | undefined} node
 * @param {import('eslint').Rule.RuleContext} context
 */
function inspect(node, context) {
  if (!node) return
  if (node.type === 'Literal') {
    if (typeof node.value === 'string' && visible(node.value)) {
      context.report({ node, messageId: 'literal' })
    }
    return
  }
  if (node.type === 'TemplateLiteral') {
    const hasText = node.quasis.some((part) => visible(part.value.cooked ?? ''))
    if (hasText) context.report({ node, messageId: 'literal' })
    return
  }
  if (node.type === 'ConditionalExpression') {
    inspect(node.consequent, context)
    inspect(node.alternate, context)
    return
  }
  if (node.type === 'LogicalExpression') {
    inspect(node.left, context)
    inspect(node.right, context)
  }
}

/** @param {string} value */
function visible(value) {
  return value.replace(/\s+/g, '').length > 0
}
