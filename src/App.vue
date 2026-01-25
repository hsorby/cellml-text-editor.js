<template>
  <div class="container">
    <div class="panel">
      <div v-if="errors.length > 0" class="error-banner">
        <div v-for="(err, index) in errors" :key="index">
          <strong>Line {{ err.line }}:</strong> {{ err.message }}
        </div>
      </div>
      <div v-else class="preview-pane" ref="latexContainer"></div>

      <div class="panel">
        <h3>CellML Text</h3>
        <textarea
          v-model="textOutput"
          class="code-view"
          @click="onCursorMove"
          @keyup="onCursorMove"
          spellcheck="false"
        ></textarea>
      </div>
    </div>

    <div class="panel">
      <h3>CellML 2.0 XML</h3>
      <textarea spellcheck="false">{{ xmlInput }}</textarea>
    </div>
  </div>
</template>

<script setup lang="ts">
// @ts-ignore
import { inject, nextTick, onMounted, ref, watch } from 'vue'
import katex from 'katex'
import 'katex/dist/katex.min.css'

import { CellMLTextGenerator } from './lib/CellMLTextGenerator'
import { CellMLTextParser, type ParserError } from './lib/CellMLTextParser'
import { CellMLLatexGenerator } from './lib/CellMLLatexGenerator'

// @ts-ignore
import { initLibCellML, updateCellMLModel } from './utils/cellml'

const libcellmlReadyPromise = inject('$libcellml_ready') as Promise<any>
// @ts-ignore
const cellmlModules = import.meta.glob('./assets/cellml/*.cellml', {
  query: 'raw',
  eager: true,
}) as Record<string, { default: string }>

// Sample CellML 2.0 XML to start with
const xmlInput = ref(`<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://www.cellml.org/cellml/2.0#" name="hodgkin_huxley_squid_axon_model_1952">
  <component name="membrane">
    <variable name="V" units="millivolt" initial_value="-65" interface="public"/>
    <variable name="t" units="millisecond" interface="public"/>
    <math xmlns="http://www.w3.org/1998/Math/MathML" xmlns:cellml="http://www.cellml.org/cellml/2.0#">
      <apply><eq/>
        <apply><diff/><bvar><ci>t</ci></bvar><ci>V</ci></apply>
        <apply><plus/>
           <ci>V</ci>
           <cn cellml:units="dimensionless">10</cn>
        </apply>
      </apply>
    </math>
  </component>
</model>`)

const xmlInput2 = ref(`
  <model xmlns="http://www.cellml.org/cellml/2.0#"  name="example_model">
  <component name="example_component">
    <variable name="q_K" units="coulomb" interface="public"/>
    <variable name="q_V" units="coulomb" interface="public"/>
    <variable name="t" units="second" interface="public"/>
    <variable name="v_NKE_K_i" units="coulomb_per_second" interface="private"/>
    <variable name="v_Kir_i" units="coulomb_per_second" interface="private"/>
    <variable name="v_AQ_api_i" units="coulomb_per_second" interface="private"/>
    <variable name="v_AQ_bas_i" units="coulomb_per_second" interface="private"/>
    <math xmlns="http://www.w3.org/1998/Math/MathML" xmlns:cellml="http://www.cellml.org/cellml/2.0#">
<apply>
        <eq/>
        <apply>
          <diff/>
          <bvar>
            <ci>t</ci>
          </bvar>
          <ci>q_K</ci>
        </apply>
        <apply>
          <plus/>
          <ci>v_NKE_K_i</ci>
          <ci>v_Kir_i</ci>
        </apply>
      </apply>
      <apply>
        <eq/>
        <apply>
          <diff/>
          <bvar>
            <ci>t</ci>
          </bvar>
          <ci>q_V</ci>
        </apply>
        <apply>
          <plus/>
          <ci>v_AQ_api_i</ci>
          <ci>v_AQ_bas_i</ci>
        </apply>
      </apply> </math>  </component></model>
`)

const textOutput = ref('')

const generator = new CellMLTextGenerator()
const parser = new CellMLTextParser()
const latexGen = new CellMLLatexGenerator()

const isUpdatingFromXml = ref(false)
let debouncer: any = null
const cursorLine = ref(1)
const latexPreview = ref('')
const latexContainer = ref<HTMLElement | null>(null)
let currentDoc: Document | null = null
const errors = ref<ParserError[]>([])

const onCursorMove = (e: Event) => {
  const textarea = e.target as HTMLTextAreaElement
  // Calculate line number from selectionStart
  const textUpToCursor = textarea.value.substr(0, textarea.selectionStart)
  cursorLine.value = textUpToCursor.split('\n').length

  updatePreview()
}

const updatePreview = () => {
  if (!currentDoc) return

  // Find the equation that matches this line.
  // We look for elements with 'data-source-location' at our cursor.
  const equations = Array.from(currentDoc.getElementsByTagNameNS('*', 'apply')) // get all apply nodes

  // Find the node with the highest line number that is <= cursorLine
  let bestMatch: Element | null = null

  for (let i = 0; i < equations.length; i++) {
    const eq = equations[i]
    if (!eq) continue

    const loc = eq.getAttribute('data-source-location')
    if (!loc) continue

    // Parse the range.
    const [startStr, endStr] = loc.split('-')
    const start = parseInt(startStr || '0', 10)
    const end = endStr ? parseInt(endStr, 10) : start

    // If we've passed the cursor line, we can stop.
    if (start > cursorLine.value) {
      break
    }

    // Check if the cursor is inside the range.
    if (cursorLine.value >= start && cursorLine.value <= end) {
      bestMatch = eq
      break
    }
  }

  // Convert to LaTeX.
  if (bestMatch) {
    const latex = latexGen.convert(bestMatch)
    latexPreview.value = latex
    if (latexContainer.value) {
      katex.render(latex, latexContainer.value, { throwOnError: false, displayMode: true })
    }
  } else {
    latexPreview.value = ''
    if (latexContainer.value) latexContainer.value.innerHTML = "<span class='placeholder'>No equation selected</span>"
  }
}

// Regenerate text whenever XML changes
watch(
  xmlInput,
  (newVal) => {
    if (isUpdatingFromXml.value) return
    textOutput.value = generator.generate(newVal)
  },
  { immediate: true }
)

watch(textOutput, (newVal) => {
  // Debounce this in production!
  if (debouncer) clearTimeout(debouncer)
  if (isUpdatingFromXml.value) return

  debouncer = setTimeout(async () => {
    try {
      const result = parser.parse(newVal)

      errors.value = result.errors

      // Only update if success
      if (result.errors.length === 0 && result.xml) {
        isUpdatingFromXml.value = true
        xmlInput.value = result.xml
        currentDoc = parser['doc']
        // Reset flag after a tick
        setTimeout(() => (isUpdatingFromXml.value = false), 100)
        await nextTick()
        updatePreview()
      }
    } catch (e) {
      // Don't update XML while user is typing invalid syntax
      // console.log('Parsing error (expected while typing):', e.message)
    }
  }, 750)
})

onMounted(async () => {
  // Load a sample CellML file from assets on startup
  libcellmlReadyPromise.then((instance) => {
    initLibCellML(instance)
  })
  await libcellmlReadyPromise

  const currentIndex = 1
  const currentModule = Object.keys(cellmlModules)[currentIndex] || ''
  console.log(`Loading CellML module: ${currentModule} [${currentIndex}/${Object.keys(cellmlModules).length}]`)
  const cellMLModelString = cellmlModules[currentModule]?.default
  xmlInput.value = updateCellMLModel(cellMLModelString)
  // xmlInput.value = xmlInput2.value
  parser.parse(textOutput.value)
  currentDoc = parser['doc']
})
</script>

<style scoped>
.container {
  display: flex;
  height: 95vh;
  gap: 20px;
  padding: 20px;
  font-family: sans-serif;
}
.panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}
textarea,
.code-view {
  flex: 1;
  background: #f4f4f4;
  border: 1px solid #ccc;
  padding: 10px;
  font-family: monospace;
  font-size: 14px;
  white-space: pre;
  overflow: auto;
}
.code-view {
  background: #1e1e1e;
  color: #d4d4d4;
}
.preview-pane {
  height: 100px;
  background: white;
  border-bottom: 2px solid #ddd;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5em;
}
.placeholder {
  color: #ccc;
  font-style: italic;
  font-size: 0.8em;
}
.error-banner {
  background-color: #ffebee;
  color: #c62828;
  padding: 10px 15px;
  border-bottom: 2px solid #ef9a9a;
  font-family: monospace;
  font-size: 0.9em;
  min-height: 40px; /* Prevent jumpiness */
  display: flex;
  flex-direction: column;
  justify-content: center;
}
</style>
