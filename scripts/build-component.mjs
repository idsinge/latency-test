import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import * as esbuild from 'esbuild'

// Usage: node scripts/build-component.mjs [--dev]
//   Default (no flag): minified ESM + IIFE (production)
//   --dev:             unminified ESM + IIFE (debugging)

const devMode = process.argv.includes('--dev')

const workerSource = readFileSync('src/scripts/worker.js', 'utf-8')
const processorSource = readFileSync('src/scripts/recorder-processor.js', 'utf-8')

const inlinePlugin = {
    name: 'inline',
    setup(build) {
        build.onLoad({ filter: /[/\\]test\.js$/ }, (args) => {
            if (args.path !== resolve('src/scripts/test.js')) return
            let source = readFileSync(args.path, 'utf-8')
            source = source.replace(
                /new URL\('worker\.js', import\.meta\.url\),/,
                `URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}], { type: 'application/javascript' })),`
            )
            if (/new URL\(['"`]worker\.js['"`]/.test(source)) {
                throw new Error('build: worker URL pattern was not inlined — check test.js')
            }
            source = source.replace(
                /const url = new URL\('\.\/recorder-processor\.js', import\.meta\.url\)\s*\n\s*const resp = await fetch\(url\)\s*\n\s*const source = await resp\.text\(\)/,
                `const source = ${JSON.stringify(processorSource)}`
            )
            if (/new URL\(['"`]\.\/recorder-processor\.js['"`]/.test(source)) {
                throw new Error('build: processor fetch pattern was not inlined — check test.js')
            }
            return { contents: source, loader: 'js' }
        })
        build.onLoad({ filter: /[/\\]latency-test-element\.js$/ }, (args) => {
            if (args.path !== resolve('src/scripts/latency-test-element.js')) return
            let source = readFileSync(args.path, 'utf-8')
            source = source.replace(
                /new URL\('\.\/worker\.js', import\.meta\.url\)/,
                `URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}], { type: 'application/javascript' }))`
            )
            if (/new URL\(['"`][./]*worker\.js['"`]/.test(source)) {
                throw new Error('build: worker URL pattern was not inlined — check latency-test-element.js')
            }
            return { contents: source, loader: 'js' }
        })
    }
}

function cleanDist() {
    mkdirSync('dist', { recursive: true })
    const files = readdirSync('dist/')
    const keep = new Set([
        'latency-test.esm.js', 'latency-test.esm.js.map',
        'latency-test.iife.js', 'latency-test.iife.js.map',
    ])
    for (const f of files) {
        if (!keep.has(f)) {
            rmSync(`dist/${f}`, { force: true })
            console.log(`  clean: dist/${f}`)
        }
    }
}

console.log(`Build mode: ${devMode ? 'development (unminified)' : 'production (minified)'}`)
cleanDist()

const esmConfig = {
    entryPoints: ['src/scripts/latency-test-element.js'],
    bundle: true,
    format: 'esm',
    outfile: 'dist/latency-test.esm.js',
    sourcemap: true,
    minify: !devMode,
    plugins: [inlinePlugin],
}

const iifeConfig = {
    entryPoints: ['src/scripts/iife-entry.js'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/latency-test.iife.js',
    sourcemap: true,
    minify: !devMode,
    plugins: [inlinePlugin],
}

await esbuild.build(esmConfig)
await esbuild.build(iifeConfig)
copyFileSync('src/index.d.ts', 'dist/index.d.ts')
console.log('Build complete.')
