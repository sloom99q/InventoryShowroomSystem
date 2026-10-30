// In-browser PDF typesetting with Typst (WebAssembly). Typst shapes Arabic
// with HarfBuzz, handles right-to-left order and embeds font subsets, so
// exported PDFs look the same on every computer. Loaded lazily: only when
// someone previews or exports a document.
//
// Fonts (public/fonts, identical to kit/fonts which the reference PDFs use):
// Liberation Sans (Arial metrics), Carlito (Calibri metrics), Noto Naskh Arabic.
import { $typst, TypstSnippet } from '@myriaddreamin/typst.ts/contrib/snippet'
import wasmUrl from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url'

export const FONT_FILES = [
  'LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf', 'LiberationSans-Italic.ttf',
  'Carlito-Regular.ttf', 'Carlito-Bold.ttf',
  'NotoNaskhArabic-Regular.ttf', 'NotoNaskhArabic-Bold.ttf',
]

let ready: Promise<void> | null = null
function init() {
  ready ??= (async () => {
    $typst.setCompilerInitOptions({ getModule: () => wasmUrl })
    $typst.use(TypstSnippet.disableDefaultFontAssets(), TypstSnippet.preloadFonts(FONT_FILES.map((f) => `/fonts/${f}`)))
  })()
  return ready
}

// One compile at a time: the compiler's file system is shared.
let queue: Promise<unknown> = Promise.resolve()

function withFiles<T>(data: unknown, files: Record<string, Uint8Array>, run: () => Promise<T>): Promise<T> {
  const job = queue.then(async () => {
    await init()
    await $typst.resetShadow()
    await $typst.mapShadow('/data.json', new TextEncoder().encode(JSON.stringify(data)))
    for (const [path, bytes] of Object.entries(files)) await $typst.mapShadow(path, bytes)
    return run()
  })
  queue = job.catch(() => undefined)
  return job
}

async function compileMain(template: string) {
  const compiler = await $typst.getCompiler()
  compiler.addSource('/main.typ', template)
  const res = await compiler.compile({ mainFilePath: '/main.typ', format: 'pdf' as never, diagnostics: 'unix' })
  if (!res.result) {
    const why = (res.diagnostics ?? []).map(String).join('\n')
    throw new Error(`The document could not be generated${why ? `:\n${why}` : ''}`)
  }
  return { compiler, pdf: res.result as Uint8Array }
}

/** Compile a template with its data (as /data.json) and files (e.g. images) to PDF bytes. */
export function compileDocument(template: string, data: unknown, files: Record<string, Uint8Array> = {}): Promise<Uint8Array> {
  return withFiles(data, files, async () => (await compileMain(template)).pdf)
}

/** Compile and also read back values the template exposes as `#metadata(...) <label>`. */
export function compileWithQuery<T>(template: string, data: unknown, files: Record<string, Uint8Array>, selector: string): Promise<{ pdf: Uint8Array; values: T[] }> {
  return withFiles(data, files, async () => {
    const compiler = await $typst.getCompiler()
    compiler.addSource('/main.typ', template)
    return compiler.runWithWorld({ mainFilePath: '/main.typ' }, async (world) => {
      const c = await world.compile({ diagnostics: 'unix' })
      if (c.hasError) throw new Error(`The document could not be generated:\n${(c.diagnostics ?? []).map(String).join('\n')}`)
      const values = await world.query<T[]>({ selector, field: 'value' })
      const out = await world.pdf({ diagnostics: 'unix' })
      if (!out.result) throw new Error('The document could not be generated')
      return { pdf: out.result, values: values ?? [] }
    })
  })
}
