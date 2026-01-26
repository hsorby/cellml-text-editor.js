const PRECEDENCE: Record<string, number> = {
  atomic: 100, // Identifiers, numbers
  func: 90, // sin, cos, exp (visually self-contained)
  power: 80, // ^
  times: 70, // *
  divide: 70, // / (usually self-contained in \frac, but good to have)
  plus: 60, // +
  minus: 60, // -
  rel: 50, // =, <, >
  unknown: 0,
}

export class CellMLLatexGenerator {
  public convert(mathMLNode: Element): string {
    if (!mathMLNode) return ''

    // Handle the <math> wrapper.
    if (mathMLNode.localName === 'math') {
      // If there are multiple equations, we will map over them.
      return Array.from(mathMLNode.children)
        .map((child: Element) => this.convert(child)) // Recursively convert each equation
        .join('\n')
    }

    // Intercept Top-Level Assignments
    // We check specifically for an <apply> block where the operator is <eq/>
    if (mathMLNode.localName === 'apply' && mathMLNode.firstElementChild?.localName === 'eq') {
      const children = Array.from(mathMLNode.children)

      // Skip the operator (index 0)
      const lhs = this.parseNode(children[1])
      const rhs = this.parseNode(children[2])

      return `${lhs} = ${rhs}`
    }

    //  Handle everything else (Expressions)
    return this.parseNode(mathMLNode)
  }

  private ignoreTag(tag: string): Boolean {
    const ignoreNodes = ['bvar']
    return ignoreNodes.includes(tag)
  }

  private parseNode(node: Element | null | undefined, contextPrecedence: number = 0): string {
    if (!node) return ''
    const tag = node.localName

    if (tag === 'apply') return this.parseApply(node, contextPrecedence)
    if (tag === 'ci') return this.parseIdentifier(node.textContent || '')
    if (tag === 'cn') return node.textContent || '0'
    if (tag === 'piecewise') return this.parsePiecewise(node)
    if (tag === 'pi') return '\\pi'
    if (this.ignoreTag(tag)) return ''

    console.warn(`Unsupported MathML node: ${tag}`)
    return ''
  }

  private escapeGreek(text: string): string {
    const greek = [
      'alpha',
      'beta',
      'gamma',
      'delta',
      'epsilon',
      'zeta',
      'eta',
      'theta',
      'iota',
      'kappa',
      'lambda',
      'mu',
      'nu',
      'xi',
      'omicron',
      'pi',
      'rho',
      'sigma',
      'tau',
      'upsilon',
      'phi',
      'chi',
      'psi',
      'omega',
    ]
    return greek.includes(text.toLowerCase()) ? `\\${text}` : text
  }

  /**
   * Specialized identifier formatter.
   * Format: Base_Sub_Super_SubOfSuper
   * Example: v_AQ_api_i -> v_{AQ}^{api_{i}}
   */
  private parseIdentifier(name: string): string {
    // Handle simple cases (no underscores)
    if (!name.includes('_')) {
      return this.escapeGreek(name)
    }

    const parts = name.split('_')

    // Base (e.g. 'v')
    const base = this.escapeGreek(parts[0] || '')

    const subParts = []
    if (parts[1]) subParts.push(parts[1])
    if (parts.length > 4) subParts.push(...parts.slice(4))

    let superBlock = ''
    if (parts.length === 3 && (parts[2] || []).length === 1) {
      subParts.push(this.escapeGreek(parts[2] || ''))
    } else if (parts[2]) {
      superBlock = this.escapeGreek(parts[2])
      if (parts[3]) {
        superBlock += `_{${this.escapeGreek(parts[3])}}`
      }
    }
    subParts.forEach((part, index) => {
      subParts[index] = this.escapeGreek(part)
    })
    const subBlock = subParts.join(',')

    let latex = base

    if (subBlock) {
      latex += `_{${subBlock}}`
    }

    if (superBlock) {
      latex += `^{${superBlock}}`
    }

    return latex
  }

  private parseApply(node: Element | null | undefined, parentPrecedence: number): string {
    const children = Array.from(node?.children || [])
    const op = children[0]?.localName || 'unknown'
    const myPrecedence = PRECEDENCE[op] || PRECEDENCE.func!
    const args = children.slice(1).map((c, index) => {
      let childExpectedPrec = myPrecedence
      // Special cases for child precedence.
      if (['divide', 'diff', 'root', 'sqrt', 'sin', 'cos', 'tan', 'exp', 'ln', 'log'].includes(op)) {
        childExpectedPrec = 0
      } else if (op === 'minus' && index === 1) {
        // Right operand of subtraction.
        childExpectedPrec = myPrecedence + 1
      }
      return this.parseNode(c, childExpectedPrec)
    })

    let latex = ''
    switch (op) {
      case 'plus':
        latex = args.join(' + ')
        break
      case 'minus':
        latex = args.length === 1 ? `-${args[0]}` : `${args[0]} - ${args[1]}`
        break
      case 'times':
        latex = args.join(' \\cdot ')
        break
      case 'divide':
        latex = `\\frac{${args[0]}}{${args[1]}}`
        break
      case 'eq':
        latex = `${args[0]} == ${args[1]}`
        break
      case 'neq':
        latex = `${args[0]} \\neq ${args[1]}`
        break
      case 'lt':
        latex = `${args[0]} < ${args[1]}`
        break
      case 'leq':
        latex = `${args[0]} \\leq ${args[1]}`
        break
      case 'gt':
        latex = `${args[0]} > ${args[1]}`
        break
      case 'geq':
        latex = `${args[0]} \\geq ${args[1]}`
        break
      case 'and':
        latex = args.join(' \\land ')
        break
      case 'or':
        latex = args.join(' \\lor ')
        break
      case 'power':
        // Look at the original DOM node for the base (the first argument)
        const baseNode = children[1]
        const baseString = args[0] || ''
        const expString = args[1]

        // Check if atomic
        const isAtomic =
          baseNode?.localName === 'ci' || (baseNode?.localName === 'cn' && !baseString.trim().startsWith('-'))

        latex = isAtomic ? `{${baseString}}^{${expString}}` : `\\left({${baseString}}\\right)^{${expString}}`
        break
      case 'root':
      case 'sqrt':
        latex = `\\sqrt{${args[0]}}` // simple sqrt
        break
      case 'diff':
        // <diff/> <bvar>t</bvar> V  --> \frac{dV}{dt}
        const bvar = children.find((c) => c.localName === 'bvar')
        const dep = children.find((c) => c.localName !== 'diff' && c.localName !== 'bvar')
        const indepStr = bvar ? this.parseNode(bvar.firstElementChild as Element) : 'x'
        const depStr = dep ? this.parseNode(dep) : 'y'
        latex = `\\frac{d${depStr}}{d${indepStr}}`
        break
      // Trig & Funcs
      case 'exp':
        latex = `e^{${args[0]}}`
        break
      case 'abs':
        latex = `\\left|${args[0]}\\right|`
        break
      case 'floor':
        latex = `\\lfloor ${args[0]} \\rfloor`
        break
      case 'ceil':
        latex = `\\lceil ${args[0]} \\rceil`
        break
      case 'cos':
      case 'cosh':
      case 'log10':
      case 'log':
      case 'ln':
      case 'max':
      case 'min':
      case 'sin':
      case 'sinh':
      case 'tan':
      case 'tanh':
        latex = `\\${op}\\left(${args[0]}\\right)`
        break

      default:
        console.log(`Unsupported MathML operator: ${op}`)
        latex = `\\text{${op}}(${args.join(', ')})`
        break
    }

    if (myPrecedence < parentPrecedence) {
      latex = `\\left(${latex}\\right)`
    }

    return latex
  }

  private parsePiecewise(node: Element): string {
    let content = ''
    const children = Array.from(node.children)
    children.forEach((child) => {
      if (child.localName === 'piece') {
        const val = this.parseNode(child.children[0])
        const cond = this.parseNode(child.children[1])
        content += `${val} & \\text{if } ${cond} \\\\ `
      } else if (child.localName === 'otherwise') {
        const val = this.parseNode(child.children[0])
        content += `${val} & \\text{otherwise}`
      }
    })
    return `\\begin{cases} ${content} \\end{cases}`
  }
}
