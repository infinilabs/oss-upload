// See: https://rollupjs.org/introduction/

// rollup.config.ts
import typescript from '@rollup/plugin-typescript'
import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import json from '@rollup/plugin-json'

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'module',
    sourcemap: false
  },
  plugins: [
    typescript({ tsconfig: './tsconfig.json' }),
    nodeResolve({
      preferBuiltins: true,
      mainFields: ['main']
    }),
    commonjs(),
    json()
  ]
}
