import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as esbuild from 'esbuild'

const workerSource = readFileSync('src/scripts/worker.js', 'utf-8')
const processorSource = readFileSync('src/scripts/recorder-processor.js', 'utf-8')

const inlinePlugin = {
    name: 'inline',
    setup(build) {
        build.onLoad({ filter: /\/test\.js$/ }, (args) => {
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
    }
}

await esbuild.build({
    entryPoints: ['src/scripts/latency-test-element.js'],
    bundle: true,
    format: 'esm',
    outfile: 'dist/latency-test.esm.js',
    sourcemap: true,
    plugins: [inlinePlugin],
})

await esbuild.build({
    entryPoints: ['src/scripts/iife-entry.js'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/latency-test.iife.js',
    sourcemap: true,
    minify: true,
    plugins: [inlinePlugin],
})