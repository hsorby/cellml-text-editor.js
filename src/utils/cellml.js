let _libcellml = null

export function initLibCellML(instance) {
  _libcellml = instance
}

export function updateCellMLModel(cellMLModelString) {
  if (!_libcellml) {
    throw new Error('libCellML is not initialized')
  }

  const parser = new _libcellml.Parser(false)
  const printer = new _libcellml.Printer()
  const model = parser.parseModel(cellMLModelString)
  const updatedCellMLModelString = printer.printModel(model, false)

  model.delete()
  parser.delete()
  printer.delete()

  return updatedCellMLModelString
}
