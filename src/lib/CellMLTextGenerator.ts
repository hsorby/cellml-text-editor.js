const CELLML_2_0_NS = 'http://www.cellml.org/cellml/2.0#'

export class CellMLTextGenerator {
  private output: string = ''
  private indentLevel: number = 0
  private domParser: DOMParser

  constructor() {
    this.domParser = new DOMParser()
  }

  // --- Helper: Indentation ---
  private indent(): string {
    return '    '.repeat(this.indentLevel)
  }

  private append(str: string, newLine: boolean = true) {
    this.output += (newLine ? this.indent() : '') + str + (newLine ? '\n' : '')
  }

  // --- Main Entry Point ---
  public generate(xmlString: string): string {
    this.output = ''
    this.indentLevel = 0

    try {
      const doc = this.domParser.parseFromString(xmlString, 'application/xml')
      const errorNode = doc.querySelector('parsererror')
      if (errorNode) throw new Error('XML Parsing Error')

      const model = doc.getElementsByTagNameNS('http://www.cellml.org/cellml/2.0#', 'model')[0]
      if (!model) throw new Error('No CellML 2.0 Model found')

      this.processModel(model)
    } catch (e: any) {
      return `// Error generating text: ${e.message}`
    }

    return this.output
  }

  // --- Recursive Processors ---

  private processModel(model: Element) {
    const name = model.getAttribute('name') || 'unnamed_model'
    this.append(`def model ${name} as`)
    this.indentLevel++

    // 1. Process Units
    const units = model.getElementsByTagName('units')
    for (let i = 0; i < units.length; i++) {
      // Only process units that are direct children of model
      if (units[i]?.parentElement === model) this.processUnits(units[i])
    }

    // 2. Process Components
    const components = model.getElementsByTagName('component')
    for (let i = 0; i < components.length; i++) {
      this.processComponent(components[i])
    }

    this.indentLevel--
    this.append(`enddef;`)
  }

  private processUnits(unit: Element | null | undefined) {
    const name = unit?.getAttribute('name') || 'unnamed_units'
    this.append(`def unit ${name} as`)
    this.indentLevel++

    const children = unit?.getElementsByTagName('unit') || []
    for (let i = 0; i < children.length; i++) {
      const u = children[i]
      if (!u) continue
      const prefix = u.getAttribute('prefix')
      const unitsRef = u.getAttribute('units')
      const exponent = u.getAttribute('exponent')
      const multiplier = u.getAttribute('multiplier')

      let line = `unit ${unitsRef}`
      if (prefix) line += ` {prefix: ${prefix}}`
      if (exponent) line += ` {exponent: ${exponent}}`
      if (multiplier) line += ` {multiplier: ${multiplier}}`
      line += ';'

      this.append(line)
    }

    this.indentLevel--
    this.append(`enddef;`)
    this.append('') // Spacer
  }

  private processComponent(component: Element | null | undefined) {
    const name = component?.getAttribute('name') || 'unnamed_component'
    this.append(`def comp ${name} as`)
    this.indentLevel++

    // Variables.
    const vars = component?.getElementsByTagName('variable') || []
    for (let i = 0; i < vars.length; i++) {
      this.processVariable(vars[i])
    }

    // Math.
    const maths = component?.getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML', 'math') || []
    for (let i = 0; i < maths.length; i++) {
      this.processMath(maths[i])
    }

    this.indentLevel--
    this.append(`enddef;`)
    this.append('') // Spacer
  }

  private processVariable(v: Element | null | undefined) {
    const name = v?.getAttribute('name')
    const units = v?.getAttribute('units')
    const initial = v?.getAttribute('initial_value')
    const inf = v?.getAttribute('interface') // public, private, etc.
    let line = `var ${name}: ${units}`
    let attributes = []

    if (initial) attributes.push(`init: ${initial}`)
    if (inf) attributes.push(`interface: ${inf}`) // Simplified mapping

    if (attributes.length > 0) {
      line += ` {${attributes.join(', ')}}`
    }
    line += ';'
    this.append(line)
  }

  // --- MathML Handling (Simplified) ---

  private processMath(math: Element | null | undefined) {
    // MathML usually consists of <apply> blocks
    const children = math?.children || []
    for (let i = 0; i < children.length; i++) {
      const expr = this.parseMathNode(children[i])
      if (expr) this.append(expr + ';')
    }
  }

  private parseMathNode(node: Element | null | undefined): string {
    if (!node) return ''
    const tag = node.localName

    if (tag === 'apply') {
      return this.parseApply(node)
    } else if (tag === 'ci') {
      // Variable
      return node.textContent?.trim() || ''
    } else if (tag === 'cn') {
      const value = node.textContent?.trim() || '0'

      // Extract the cellml:units attribute
      const units = node.getAttributeNS(CELLML_2_0_NS, 'units')

      if (units) {
        // Format: 2 {units: dimensionless}
        return `${value} {units: ${units}}`
      }
      return value
    } else if (tag === 'piecewise') {
      return this.parsePiecewise(node)
    } else if (tag === 'pi') {
      return 'pi'
    } else if (tag === 'bvar') {
      return '' // Bound variable, handled in context
    }
    console.log(`Unsupported MathML node: ${tag}`)
    return `/* Unsupported MathML node: ${tag} */`
  }

  private parseApply(applyNode: Element): string {
    const children = Array.from(applyNode.children)
    if (children.length === 0) return ''

    const op = children[0]?.localName
    const args = children.slice(1).map((c) => this.parseMathNode(c))

    // Operator Mapping
    switch (op) {
      case 'plus':
        return `(${args.join(' + ')})`
      case 'minus':
        return args.length === 1 ? `-${args[0]}` : `(${args[0]} - ${args[1]})`
      case 'times':
        return `(${args.join(' * ')})`
      case 'divide':
        return `(${args[0]} / ${args[1]})`
      case 'eq':
        return `${args[0]} = ${args[1]}`
      case 'diff':
        // Logic: <diff/> <bvar><ci>t</ci></bvar> <ci>V</ci> -> ode(V, t)
        const bvar = children.find((c) => c.localName === 'bvar')
        const dependent = children.find((c) => c.localName !== 'diff' && c.localName !== 'bvar')
        const indep = bvar?.children[0]?.textContent || 't' // Assuming <bvar><ci>t</ci></bvar>
        const dep = dependent ? this.parseMathNode(dependent) : 'unknown'
        return `ode(${dep}, ${indep})`

      // Functions
      case 'sin':
      case 'cos':
      case 'tan':
      case 'exp':
      case 'ln':
      case 'log':
        return `${op}(${args[0]})`

      default:
        return `${op}(${args.join(', ')})`
    }
  }

  private parsePiecewise(node: Element | null | undefined): string {
    // Basic support for piecewise
    // format: sel case cond: val; case cond: val; otherwise: val; endsel;
    let pieces: string[] = []
    const children = Array.from(node?.children || [])
    children.forEach((child) => {
      if (child.localName === 'piece') {
        // <piece> <value> <condition> </piece>
        const val = this.parseMathNode(child.children[0])
        const cond = this.parseMathNode(child.children[1])
        pieces.push(`case ${cond}: ${val};`)
      } else if (child.localName === 'otherwise') {
        const val = this.parseMathNode(child.children[0])
        pieces.push(`otherwise ${val};`)
      }
    })

    return `sel\n        ${pieces.join('\n        ')}\n    endsel`
  }
}
