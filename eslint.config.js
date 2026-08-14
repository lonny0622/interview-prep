import js from '@eslint/js'

export default [
  { ignores: ['dist/**', 'dist-server/**', 'node_modules/**'] },
  js.configs.recommended,
]
