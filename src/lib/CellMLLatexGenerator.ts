export class CellMLLatexGenerator {
  public convert(mathMLNode: Element): string {
    // If we are passed a raw <math> tag, find the first child
    if (mathMLNode.localName === 'math') {
      return this.convert(mathMLNode.firstElementChild as Element)
    }
    return this.parseNode(mathMLNode)
  }

  private parseNode(node: Element | null | undefined): string {
    if (!node) return ''
    const tag = node.localName

    if (tag === 'apply') return this.parseApply(node)
    if (tag === 'ci') return this.parseIdentifier(node.textContent || '')
    if (tag === 'cn') return node.textContent || '0'
    if (tag === 'piecewise') return this.parsePiecewise(node)

    return ''
  }

  private parseIdentifier(name: string): string {
    // Convert greek words to latex (e.g. "alpha" -> "\alpha")
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
    if (greek.includes(name)) return `\\${name}`

    // Subscripts: "V_m" -> "V_{m}"
    if (name.includes('_')) {
      const parts = name.split('_')
      const adjustedName = greek.includes(parts[0]) ? `\\${parts[0]}` : parts[0]
      return `${adjustedName}_{${parts.slice(1).join('_')}}`
    }

    return name
  }

  private parseApply(node: Element | null | undefined): string {
    const children = Array.from(node?.children || [])
    const op = children[0]?.localName
    const args = children.slice(1).map((c) => this.parseNode(c))

    switch (op) {
      case 'plus':
        return args.join(' + ')
      case 'minus':
        return args.length === 1 ? `-${args[0]}` : `${args[0]} - ${args[1]}`
      case 'times':
        return args.join(' \\cdot ')
      case 'divide':
        return `\\frac{${args[0]}}{${args[1]}}`
      case 'eq':
        return `${args[0]} = ${args[1]}`
      case 'power':
        return `{${args[0]}}^{${args[1]}}`
      case 'root':
        return `\\sqrt{${args[0]}}` // simple sqrt
      case 'diff':
        // <diff/> <bvar>t</bvar> V  --> \frac{dV}{dt}
        const bvar = children.find((c) => c.localName === 'bvar')
        const dep = children.find((c) => c.localName !== 'diff' && c.localName !== 'bvar')
        const indepStr = bvar ? this.parseNode(bvar.firstElementChild as Element) : 'x'
        const depStr = dep ? this.parseNode(dep) : 'y'
        return `\\frac{d${depStr}}{d${indepStr}}`

      // Trig & Funcs
      case 'sin':
      case 'cos':
      case 'tan':
      case 'exp':
      case 'log':
      case 'ln':
        return `\\${op}\\left(${args[0]}\\right)`

      default:
        return `\\text{${op}}(${args.join(', ')})`
    }
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
