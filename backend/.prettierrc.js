module.exports = {
  // --- Standard Code Formatting Rules ---
  singleQuote: true,
  semi: false,
  trailingComma: 'all',
  tabWidth: 2,
  printWidth: 80,
  arrowParens: 'always',

  // Keep the Prisma plugin loaded to format schema.prisma files
  plugins: [require('prettier-plugin-prisma')],
}
