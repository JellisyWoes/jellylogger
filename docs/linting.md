# Linting and Code Quality Setup

This document describes the comprehensive linting and code quality setup for JellyLogger.

## 🛠️ Tools and Configuration

### ESLint Configuration

The project uses **ESLint 9** with TypeScript support and comprehensive rules for code quality:

- **Config File**: `eslint.config.js` (flat config format)
- **TypeScript Integration**: Full TypeScript-aware linting with type checking
- **Bun-Optimized**: Configured for Bun runtime with appropriate globals
- **Test-Aware**: Separate rules for test files with relaxed restrictions

### Prettier Configuration

- **Config File**: `.prettierrc`
- **Formatting**: Consistent code formatting across the entire codebase
- **Integration**: Integrated with ESLint to avoid conflicts

### EditorConfig

- **Config File**: `.editorconfig`
- **Purpose**: Consistent editor settings across different IDEs and editors

## 📋 Available Scripts

```bash
# Linting
bun run lint           # Run ESLint with max 30 warnings allowed
bun run lint:fix       # Auto-fix ESLint issues where possible
bun run lint:check     # Strict linting with 0 warnings allowed (for CI)

# Formatting
bun run format         # Format code with Prettier
bun run format:check   # Check if code is properly formatted

# Type Checking
bun run typecheck      # Run TypeScript compiler without emitting files

# All Checks (CI Pipeline)
bun run ci             # Run all quality checks: typecheck → lint:check → format:check → test
```

## 🎯 Current Status

### ✅ Successfully Implemented

1. **ESLint 9 with Flat Config**: Modern configuration format
2. **TypeScript Integration**: Full type-aware linting
3. **Prettier Integration**: Automatic code formatting
4. **Pre-commit Hook**: Automated quality checks before commits
5. **VS Code Settings**: Optimized development experience
6. **CI Pipeline**: Comprehensive quality gate script

### ⚠️ Known Issues (Expected in Active Development)

The project currently has **145 linting issues** (119 errors, 26 warnings), which is normal for an actively developed codebase. These fall into categories:

**Priority 1 - Critical Issues:**

- 6 `no-redeclare` errors (duplicate declarations)
- 8 `prefer-nullish-coalescing` errors (use `??` instead of `||`)
- 3 `consistent-type-imports` errors (import type declarations)

**Priority 2 - Code Quality:**

- 26 `@typescript-eslint/no-explicit-any` warnings (replace `any` types)
- Multiple `no-unused-vars` and `@typescript-eslint/no-unused-vars` errors
- Missing trailing commas and other style issues

**Priority 3 - Test Files:**

- Unused imports and variables in test files
- Control character regex issues in tests
- Missing global definitions

## 🔧 Development Workflow

### For Contributors

1. **Before Making Changes:**

   ```bash
   # Check current status
   bun run lint
   ```

2. **During Development:**

   ```bash
   # Auto-fix what can be fixed
   bun run lint:fix
   bun run format
   ```

3. **Before Committing:**
   ```bash
   # Run full CI pipeline
   bun run ci
   ```

The pre-commit hook automatically runs these checks, but it's better to run them manually to catch issues early.

### For Maintainers

To gradually improve code quality:

1. **Fix Critical Issues First:** Focus on `no-redeclare` and `prefer-nullish-coalescing` errors
2. **Replace `any` Types:** Gradually add proper type definitions
3. **Clean Up Unused Code:** Remove or prefix unused variables with underscore
4. **Update Test Files:** Fix test-specific linting issues

## 🎨 IDE Integration

### VS Code (Recommended)

The project includes VS Code configuration in `.vscode/`:

- **settings.json**: Auto-format on save, ESLint integration
- **extensions.json**: Recommended extensions for optimal experience

**Recommended Extensions:**

- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`)
- TypeScript Importer (`ms-vscode.vscode-typescript-next`)

### Other IDEs

The `.editorconfig` file ensures consistent settings across all editors that support EditorConfig.

## 🚀 Future Improvements

1. **Add Husky**: More robust pre-commit hook management
2. **Add lint-staged**: Only lint changed files for faster commits
3. **Add SonarCloud**: Advanced code quality analysis
4. **Custom ESLint Rules**: Project-specific linting rules for logging patterns
5. **Performance Linting**: Rules specific to high-performance logging code

## 📊 Quality Metrics

Current linting configuration enforces:

- ✅ TypeScript strict mode compliance
- ✅ Import/export organization
- ✅ Consistent code formatting
- ✅ Modern JavaScript/TypeScript patterns
- ✅ Bun runtime compatibility
- ✅ Test code best practices

## 🤝 Contributing

When contributing to the project:

1. Ensure your code passes `bun run ci`
2. Fix any new linting errors your changes introduce
3. Follow the established patterns for type definitions
4. Use `bun run lint:fix` to auto-fix style issues

The linting setup is designed to be helpful, not burdensome. If you encounter issues with the configuration, please open an issue for discussion.
