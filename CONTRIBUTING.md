# Contributing to JellyLogger

Thank you for your interest in contributing to JellyLogger! This guide will help you get started with contributing to our Bun-optimized logging library.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Contribution Workflow](#contribution-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Release Process](#release-process)
- [Community Guidelines](#community-guidelines)

## Development Setup

### Prerequisites
- **Bun v1.2.13+** (required)
- **Git**
- **TypeScript knowledge** (recommended)

### Getting Started

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/yourusername/jellylogger.git
   cd jellylogger
   ```

2. **Install dependencies:**
   ```bash
   bun install
   ```

3. **Run tests to verify setup:**
   ```bash
   bun test
   ```

4. **Build the project:**
   ```bash
   bun run build
   ```

5. **Link for local development:**
   ```bash
   bun link
   ```

### Development Commands

```bash
# Run tests
bun test

# Run tests in watch mode
bun test --watch

# Build the project
bun run build

# Type checking
bun run typecheck

# Lint code
bun run lint

# Format code
bun run format

# Run all checks (CI simulation)
bun run ci
```

## Project Structure

```
jellylogger/
├── lib/
│   ├── core/
│   ├── formatters/
│   ├── redaction/
│   ├── transports/
│   ├── utils/
│   └── index.ts
├── test/
```

## Contribution Workflow

### 1. Create an Issue (Optional)

For significant changes, create an issue first to discuss:
- New features
- Breaking changes
- Major bug fixes
- Architecture changes

### 2. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

**Branch naming conventions:**
- `feature/feature-name` - New features
- `fix/bug-description` - Bug fixes
- `docs/documentation-update` - Documentation changes
- `refactor/component-name` - Code refactoring
- `test/test-description` - Test improvements

### 3. Make Changes

Follow our [coding standards](#coding-standards) and ensure:
- Code is well-tested
- TypeScript types are properly defined
- Documentation is updated
- Bun-specific optimizations are considered

### 4. Test Your Changes

```bash
# Run all tests
bun test

# Run specific test files
bun test src/transports/file.test.ts

# Test with coverage
bun test --coverage

# Integration tests
bun run test:integration
```

### 5. Submit a Pull Request

See [Pull Request Guidelines](#pull-request-guidelines) below.

## Coding Standards

### TypeScript Guidelines

- **Explicit typing**: Always specify explicit types for function parameters and return values
- **Interface design**: Use clear, dedicated interfaces for complex objects
- **Type guards**: Implement type guards for runtime type checking when necessary

```typescript
// ✅ Good
interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

function formatLogEntry(entry: LogEntry): string {
  // Implementation
}

// ❌ Avoid
function formatLogEntry(entry: any): any {
  // Implementation
}
```

### Bun-Specific Guidelines

- **Leverage Bun APIs**: Use `Bun.write()`, `Bun.file()`, and other native APIs where appropriate
- **Performance-first**: Consider performance implications of all changes
- **Async patterns**: Use Bun's async patterns and avoid blocking operations

```typescript
// ✅ Good - Use Bun's native file API
async function writeLog(path: string, data: string): Promise<void> {
  await Bun.write(path, data);
}

// ❌ Avoid - Node.js fs when Bun alternative exists
import { writeFile } from "node:fs/promises";
async function writeLog(path: string, data: string): Promise<void> {
  await writeFile(path, data);
}
```

### Code Style

- **Formatting**: Use Prettier configuration (run `bun run format`)
- **Linting**: Follow ESLint rules (run `bun run lint`)
- **Naming**: Use descriptive names for variables, functions, and classes
- **Comments**: Add JSDoc comments for public APIs

```typescript
/**
 * Creates a new file transport for logging to files with rotation support.
 * 
 * @param filePath - Path to the log file
 * @param options - Configuration options for the transport
 * @returns A configured FileTransport instance
 * 
 * @example
 * ```typescript
 * const transport = new FileTransport('./logs/app.log', {
 *   maxFileSize: 10 * 1024 * 1024, // 10MB
 *   maxFiles: 5,
 *   compress: true
 * });
 * ```
 */
export class FileTransport implements Transport {
  // Implementation
}
```

## Testing

### Test Structure

- **Unit tests**: Test individual functions and classes
- **Integration tests**: Test transport integrations and complex workflows
- **Performance tests**: Ensure Bun optimizations work as expected

### Test Guidelines

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";

describe("FileTransport", () => {
  let transport: FileTransport;
  let tempFile: string;

  beforeEach(() => {
    tempFile = `/tmp/test-${Date.now()}.log`;
    transport = new FileTransport(tempFile);
  });

  afterEach(async () => {
    await transport.close();
    // Cleanup temp files
  });

  it("should write log entries to file", async () => {
    const entry: LogEntry = {
      level: LogLevel.INFO,
      message: "test message",
      timestamp: Date.now()
    };

    await transport.log(entry);
    
    const content = await Bun.file(tempFile).text();
    expect(content).toContain("test message");
  });
});
```

### Performance Testing

Include performance benchmarks for critical paths:

```typescript
import { bench, run } from "mitata";

bench("FileTransport.log", async () => {
  await transport.log(testEntry);
});

await run();
```

## Documentation

### Code Documentation

- Add JSDoc comments to all public APIs
- Include usage examples in complex functions
- Document performance characteristics when relevant

### README and Guides

- Update README.md for new features
- Add examples to relevant documentation files
- Update API documentation when interfaces change

### Examples

Add practical examples in the `examples/` directory:

```typescript
// examples/custom-transport.ts
import { Transport, LogEntry } from "jellylogger";

export class CustomTransport implements Transport {
  async log(entry: LogEntry): Promise<void> {
    // Example implementation
  }
}
```

## Pull Request Guidelines

### Before Submitting

- [ ] All tests pass (`bun test`)
- [ ] Code is properly formatted (`bun run format`)
- [ ] No linting errors (`bun run lint`)
- [ ] TypeScript compiles without errors (`bun run typecheck`)
- [ ] Documentation is updated
- [ ] Examples are added for new features

### PR Description Template

```markdown
## Description
Brief description of the changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Performance improvement

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Performance Impact
Describe any performance implications.

## Breaking Changes
List any breaking changes and migration steps.

## Documentation
- [ ] README updated
- [ ] API docs updated
- [ ] Examples added
```

### Review Process

1. **Automated checks**: CI must pass
2. **Code review**: At least one maintainer review required
3. **Testing**: Ensure comprehensive test coverage
4. **Documentation**: Verify documentation is complete and accurate

## Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):
- **Major** (x.0.0): Breaking changes
- **Minor** (0.x.0): New features, backward compatible
- **Patch** (0.0.x): Bug fixes, backward compatible

### Release Checklist

- [ ] All tests pass
- [ ] Documentation is up to date
- [ ] CHANGELOG.md is updated
- [ ] Version is bumped in package.json
- [ ] Git tag is created
- [ ] npm package is published

## Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help newcomers get started
- Focus on technical merit

### Communication

- **Issues**: For bug reports and feature requests
- **Discussions**: For questions and general discussion
- **Discord**: For real-time chat (link in README)

### Getting Help

If you need help:

1. Check existing issues and documentation
2. Ask in GitHub Discussions
3. Join our Discord community
4. Reach out to maintainers

## Recognition

Contributors will be:
- Listed in the repository contributors
- Mentioned in release notes for significant contributions
- Invited to join the maintainer team for sustained contributions

---

Thank you for contributing to JellyLogger! Your contributions help make logging better for the entire Bun community. 🎉
