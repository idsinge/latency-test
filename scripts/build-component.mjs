import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import * as esbuild from 'esbuild'

// Usage: node scripts/build-component.mjs [--dev] [--legacy]
//   Default (no flag): minified ESM + IIFE (production)
//   --dev:             unminified ESM + IIFE (debugging)
//   --legacy:          transpile for Safari 14 / Chrome 78 (private fields, optional chaining, nullish coalescing)
//                      outputs latency-test.legacy.esm.js + latency-test.legacy.iife.js

const devMode = process.argv.includes('--dev')
const legacyMode = process.argv.includes('--legacy')

// Features absent in Safari 14 / Chrome 78 — esbuild lowers these to ES5-compatible equivalents.
// Using `supported` rather than `target` avoids esbuild's unsupported destructuring-lowering path.
const legacySupported = {
    'class-private-field': false,
    'class-private-method': false,
    'optional-chain': false,
    'nullish-coalescing': false,
}

const processorSource = readFileSync('src/scripts/recorder-processor.js', 'utf-8')

async function bundleWorker() {
    const result = await esbuild.build({
        entryPoints: ['src/scripts/worker.js'],
        bundle: true,
        format: 'iife',
        write: false,
        minify: !devMode,
        ...(legacyMode && { supported: legacySupported }),
    })
    return result.outputFiles[0].text
}

const workerIife = await bundleWorker()

async function transpileProcessor(source) {
    const result = await esbuild.transform(source, {
        loader: 'js',
        supported: legacySupported,
    })
    return result.code
}

const processorSourceForBundle = legacyMode
    ? await transpileProcessor(processorSource)
    : processorSource

const inlinePlugin = {
    name: 'inline',
    setup(build) {
        build.onLoad({ filter: /[/\\]test\.js$/ }, (args) => {
            if (args.path !== resolve('src/scripts/test.js')) return
            let source = readFileSync(args.path, 'utf-8')
            source = source.replace(
                /const url = new URL\('\.\/recorder-processor\.js', import\.meta\.url\)\s*\n\s*const resp = await fetch\(url\)\s*\n\s*const source = await resp\.text\(\)/,
                `const source = ${JSON.stringify(processorSourceForBundle)}`
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
                /new Worker\(new URL\('\.\/worker\.js', import\.meta\.url\),\s*\{\s*type:\s*'module'\s*\}\)/,
                `new Worker(URL.createObjectURL(new Blob([${JSON.stringify(workerIife)}], { type: 'application/javascript' })))`
            )
            if (/new Worker\(new URL\(/.test(source)) {
                throw new Error('build: Worker module constructor was not replaced — check latency-test-element.js')
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
        'latency-test.legacy.esm.js', 'latency-test.legacy.esm.js.map',
        'latency-test.legacy.iife.js', 'latency-test.legacy.iife.js.map',
    ])
    for (const f of files) {
        if (!keep.has(f)) {
            rmSync(`dist/${f}`, { force: true })
            console.log(`  clean: dist/${f}`)
        }
    }
}

const modeLabel = [
    devMode ? 'development (unminified)' : 'production (minified)',
    legacyMode ? 'legacy (Safari 14 / Chrome 78)' : null,
].filter(Boolean).join(', ')
console.log(`Build mode: ${modeLabel}`)
cleanDist()

const esmConfig = {
    entryPoints: ['src/scripts/latency-test-element.js'],
    bundle: true,
    format: 'esm',
    outfile: legacyMode ? 'dist/latency-test.legacy.esm.js' : 'dist/latency-test.esm.js',
    sourcemap: true,
    minify: !devMode,
    plugins: [inlinePlugin],
    ...(legacyMode && { supported: legacySupported }),
}

const iifeConfig = {
    entryPoints: ['src/scripts/iife-entry.js'],
    bundle: true,
    format: 'iife',
    outfile: legacyMode ? 'dist/latency-test.legacy.iife.js' : 'dist/latency-test.iife.js',
    sourcemap: true,
    minify: !devMode,
    plugins: [inlinePlugin],
    ...(legacyMode && { supported: legacySupported }),
}

await esbuild.build(esmConfig)
await esbuild.build(iifeConfig)
copyFileSync('src/index.d.ts', 'dist/index.d.ts')
console.log('Build complete.')
