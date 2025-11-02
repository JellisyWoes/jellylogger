# Test Documentation

Complete reference guide for all tests in the jellylogger repository. This document catalogs all test suites, test cases, and their purposes.

## Table of Contents

1. [Core Logger Tests](#core-logger-tests)
2. [Child Logger Tests](#child-logger-tests)
3. [Transport Tests](#transport-tests)
4. [Formatter Tests](#formatter-tests)
5. [Redaction Tests](#redaction-tests)
6. [Utility Tests](#utility-tests)
7. [Integration Tests](#integration-tests)

---

## Core Logger Tests

### Logger (`test/logger.test.ts`)

Core logger functionality and configuration tests.

#### Default Options
- **should have default options set correctly**: Verifies that the logger is initialized with correct defaults (INFO level, string format, human-readable time enabled, transports configured)

#### setOptions and resetOptions
- **should set options correctly**: Verifies that custom options can be applied (level, format, time format)
- **should reset options to defaults**: Ensures resetOptions restores initial configuration
- **should preserve transports when resetting options**: Confirms transports survive a reset operation

#### Logging Methods
Tests for each log level method (`fatal`, `error`, `warn`, `info`, `debug`, `trace`):
- **should pass optionalParams to transport.log**: Verifies structured data is properly forwarded
- **should handle no optionalParams**: Ensures logging works without additional data

#### Multiple Transports
- **should write to multiple transports**: Confirms logs are sent to all registered transports simultaneously

#### Edge Cases
- **should not throw if transport.log throws**: Verifies graceful error handling when a transport fails
- **should allow setting custom transports at runtime**: Confirms dynamic transport configuration
- **should allow changing log level at runtime**: Verifies log level can be changed between calls
- **should support multiple transports with different behaviors**: Tests that different transports can coexist and function independently

### Logger Flush All (`test/logger-flush-all.test.ts`)

Tests for graceful shutdown and buffer flushing.

- **should flush all transports that have flush method**: Verifies all transports with a flush method are called
- **should handle transports without flush method gracefully**: Ensures non-flushable transports don't cause errors
- **should handle flush errors gracefully**: Tests error recovery during flush operations
- **should flush Discord webhook transport**: Verifies Discord-specific flush behavior
- **should pass logger options to flush methods**: Confirms options are available during flush
- **should work with empty transports array**: Tests behavior with no active transports
- **should handle multiple flush errors**: Ensures multiple concurrent flush errors are handled
- **should await all flush operations concurrently**: Verifies flush operations run in parallel
- **should work with child logger flush**: Confirms child loggers can flush properly

---

## Child Logger Tests

### ChildLogger (`test/child-logger.test.ts`)

Tests for child logger creation, message prefixes, and data inheritance.

#### Message Prefix
- **should prepend message prefix from parent and child**: Verifies prefix composition (e.g., `[AUTH] [LOGIN]`)
- **should handle empty message prefix gracefully**: Tests handling of empty string prefixes
- **should handle undefined message prefix**: Tests handling of missing prefixes
- **should handle multiple message prefixes**: Tests deeply nested prefix composition

#### Structured Data Through Logging Calls
- **should pass structured data through log calls**: Verifies data objects are included in entries
- **should handle multiple arguments with structured data**: Tests mixed argument types (strings, objects, numbers)
- **should merge multiple data objects from arguments**: Confirms data objects are merged when multiple are provided

#### Options Inheritance
- **should inherit parent logger options**: Verifies log level and other settings are inherited
- **should inherit redaction settings from parent**: Tests redaction config inheritance

#### Multiple Inheritance Levels
- **should handle deeply nested child loggers**: Tests 4+ levels of nesting
- **should maintain performance with many inheritance levels**: Performance test with 10 levels of nesting

#### Child Logger Isolation
- **should not affect parent logger when child is modified**: Verifies isolation between parent and child
- **should not affect sibling loggers**: Tests that sibling children don't interfere with each other

#### Child Logger Creation
- **should create child logger from child logger**: Tests chaining child() calls
- **should work with only messagePrefix**: Tests minimal child configuration
- **should work with empty options**: Tests child() with empty object
- **should work without any options**: Tests child() without parameters

#### Error Handling
- **should handle errors in child logger**: Tests Error object serialization in child loggers
- **should handle complex data structures**: Tests nested objects, arrays, and mixed types

#### Level Filtering
- **should respect log level filtering for child loggers**: Verifies level gates are inherited and enforced

### ChildLogger Context/defaultData (`test/child-logger-context.test.ts`)

Tests for persistent data merging with per-call data.

- **should merge defaultData into log entries**: Verifies persistent defaultData appears in all logs
- **should merge context into log entries**: Tests context object merging
- **should prefer context over defaultData when both provided**: Confirms context takes precedence
- **should merge per-call data with persistent data**: Tests runtime data combined with stored data
- **should allow per-call data to override persistent data**: Verifies per-call data overrides defaults
- **should work without any context/defaultData**: Tests operation without persistent data
- **should merge context through nested child loggers**: Tests data inheritance across levels
- **should handle empty context/defaultData objects**: Tests empty object edge case
- **should work with all log levels**: Tests data merging with each log level
- **should handle complex nested data structures**: Tests deeply nested objects
- **should preserve non-object args alongside context data**: Tests mixed argument types
- **should handle multiple object parameters with context**: Tests multiple data objects
- **should work correctly with flushAll**: Tests data persistence through flush operations

### ChildLogger Context Edge Cases (`test/child-logger-context-edge-cases.test.ts`)

Advanced edge cases for context/defaultData functionality.

- **should handle deeply nested child loggers with context inheritance**: Tests data inheritance through 4+ levels
- **should handle null and undefined values in context**: Tests null/undefined handling
- **should handle special characters and unicode in context keys and values**: Tests unicode, emoji, special chars
- **should handle arrays and complex types in context**: Tests arrays, objects, mixed types
- **should handle Error objects in context**: Tests Error serialization in context
- **should handle large context objects efficiently**: Performance test with ~1000 fields
- **should handle context merging with Symbol keys**: Tests Symbol property handling
- **should handle frozen and sealed objects in context**: Tests Object.freeze() and Object.seal()
- **should handle context with getters and computed properties**: Tests property getter behavior
- **should handle context with circular references gracefully**: Tests circular reference detection
- **should handle empty string keys in context**: Tests empty key edge case
- **should handle numeric keys in context**: Tests numeric key behavior
- **should maintain context through flushAll and multiple operations**: Tests context persistence
- **should handle rapid logging with context**: Stress test with rapid sequential logging

---

## Transport Tests

### Console Transport (`test/console-transport.test.ts`)

Tests for console output formatting and behavior.

#### Log Level Mapping
For each log level (FATAL/ERROR → console.error, WARN → console.warn, etc.):
- **should use console.{method} for LogLevel.{level} in string format**: Verifies correct console method is called
- **should use console.{method} for LogLevel.{level} in JSON format**: Tests JSON output routing

#### String Formatting
- **should format string logs correctly**: Tests default string format output
- **should default to string format if options.format is undefined**: Tests missing format option
- **should format string logs correctly with no args**: Tests message-only logging

#### Color System
- **should use customConsoleColors with hex, rgb, hsl, hsv, cmyk**: Tests color format support
- **should fallback to empty string for invalid custom color**: Tests invalid color handling
- **should allow ANSI escape codes directly in customConsoleColors**: Tests raw ANSI codes
- **should merge customConsoleColors with defaults**: Tests color merging with defaults
- **should support formatter function**: Tests custom formatting function
- **should support formatter function with customConsoleColors**: Tests formatter + colors together

#### Edge Cases
- **should not throw if customConsoleColors is empty object**: Tests empty color config
- **should handle missing reset/bold/dim in customConsoleColors**: Tests partial color config
- **should log with multiple args of different types**: Tests mixed arg types
- **should log error objects with cause**: Tests Error.cause serialization
- **should log error objects with non-error cause**: Tests non-Error cause values
- **should log error objects with string cause**: Tests string cause values
- **should log error objects with circular cause gracefully**: Tests circular reference handling
- **should support formatter returning empty string**: Tests empty formatter output
- **should support formatter returning non-string**: Tests type coercion
- **should support formatter with args**: Tests formatter access to args

### File Transport Errors (`test/file-transport-errors.test.ts`)

Tests for file transport error handling and resilience.

- **should handle write failures gracefully**: Tests disk-full and permission errors
- **should handle file system permission errors**: Tests EACCES and similar errors
- **should handle file existence check failures**: Tests fs.existsSync errors
- **should handle writer creation failures**: Tests writer initialization errors
- **should continue logging after temporary errors**: Tests recovery after transient failures
- **should handle buffer overflow gracefully**: Tests large write operations
- **should handle corrupted file scenarios**: Tests recovery from corrupted state

### File Transport Rotation (`test/file-transport-rotation.test.ts`)

Tests for log file rotation, compression, and cleanup.

#### Size-Based Rotation
- **should rotate log file when maxFileSize is exceeded**: Tests file size threshold
- **should maintain maxFiles limit**: Tests old file cleanup
- **should update rotated file path correctly**: Tests file naming (e.g., app.log.1)
- **should not rotate if file size is below threshold**: Tests rotation guard
- **should handle rotation with concurrent logging**: Tests race conditions
- **should preserve partial logs during rotation**: Tests no log loss

#### Date-Based Rotation
- **should rotate based on date change**: Tests daily rotation logic
- **should format date-based rotated files correctly**: Tests date filename patterns
- **should preserve date rotation history**: Tests multiple date rotations
- **should handle timezone considerations**: Tests date edge cases

#### Compression
- **should compress rotated files when compress option enabled**: Tests gzip compression
- **should maintain compressed and uncompressed files**: Tests mixed compression
- **should handle compression errors gracefully**: Tests compression failure recovery

#### Error Handling in Rotation
- **should handle rename failures during rotation**: Tests failed file moves
- **should handle compression failures**: Tests gzip errors
- **should continue logging on rotation errors**: Tests resilience

### Discord Webhook Transport (`test/discord-webhook-transport.test.ts`)

Tests for Discord webhook delivery and batching.

- **should batch logs and retry on failure**: Tests batching logic and retry behavior
- **should apply console redaction to Discord messages**: Tests redaction before sending
- **should handle network failures gracefully**: Tests timeout and connection errors
- **should respect maxBatchSize**: Tests batch size limiting
- **should format messages correctly**: Tests message formatting for Discord

### Discord Webhook Enhanced (`test/discord-webhook-enhanced.test.ts`)

Advanced Discord webhook tests.

#### Rate Limiting
- **should handle 429 rate limit with retry_after**: Tests Discord rate limit response
- **should give up after max retries on persistent rate limits**: Tests retry exhaustion
- **should respect global rate limit**: Tests global Discord API rate limit

#### Message Truncation
- **should truncate messages exceeding Discord's 2000 character limit**: Tests message size cap
- **should truncate batched messages when combined length exceeds limit**: Tests batched truncation
- **should preserve important log information when truncating**: Tests truncation priority

#### Error Recovery
- **should recover from transient network errors**: Tests temporary network failure recovery
- **should handle malformed webhook URLs gracefully**: Tests invalid URL handling

#### Advanced Batching
- **should handle rapid bursts of logs efficiently**: Tests high-frequency batching
- **should respect batch interval timing**: Tests batch timing accuracy

### WebSocket Transport (`test/websocket-transport.test.ts`)

Tests for WebSocket log delivery.

- **should connect and send log messages**: Tests connection and message sending
- **should send JSON formatted messages**: Tests JSON output format
- **should handle multiple log entries**: Tests batch sending
- **should handle flush operation**: Tests graceful flush
- **should handle connection state properly**: Tests connection state transitions

### WebSocket Transport Implementation (`test/websocket-transport-implementation.test.ts`)

Advanced WebSocket transport tests.

- **should create WebSocket connection with correct URL**: Tests connection initialization
- **should send log messages after connection is established**: Tests send-after-connect ordering
- **should queue messages when connection is not ready**: Tests message queuing
- **should handle connection failures gracefully**: Tests connection error handling
- **should apply redaction when configured**: Tests redaction before sending
- **should skip redaction when disabled**: Tests optional redaction
- **should use custom serializer when provided**: Tests custom serialization
- **should handle reconnection configuration**: Tests reconnect logic
- **should flush queued messages**: Tests message flush

### Console and File Synchronization (`test/console-file-sync.test.ts`)

Tests for consistent output across multiple transports.

- **should write the same logs to both console and memory transport in string format**: Tests format consistency
- **should write the same logs to both console and memory transport in JSON format**: Tests JSON consistency
- **should handle complex data structures identically in both transports**: Tests data handling
- **should maintain timestamp consistency between console and memory transport**: Tests timestamp sync
- **should handle different log levels consistently**: Tests level handling consistency
- **should handle errors and circular references consistently**: Tests error handling consistency
- **should respect log level filtering consistently**: Tests level filtering consistency

### Transport Management (`test/transport-management.test.ts`)

Tests for transport lifecycle and management.

#### addTransport
- **should add transport to empty transports array**: Tests initial transport addition
- **should add transport to existing transports**: Tests adding to existing list
- **should initialize transports array if undefined**: Tests lazy initialization
- **should support adding multiple transport types**: Tests mixed transport types

#### removeTransport
- **should remove transport from transports array**: Tests transport removal
- **should handle removing non-existent transport**: Tests removal of missing transport
- **should handle removing transport when transports is undefined**: Tests removal edge case
- **should remove correct transport when multiple of same type**: Tests selective removal

#### clearTransports
- **should clear all transports**: Tests full transport clearing
- **should work when transports is already empty**: Tests idempotency
- **should work when transports is undefined**: Tests undefined edge case

#### setTransports
- **should replace all transports with new array**: Tests transport replacement
- **should create copy of transports array**: Tests array copying
- **should handle empty array**: Tests empty transport list
- **should handle single transport in array**: Tests single transport

#### Transport Management Integration
- **should work with logger methods after transport management**: Tests logging after changes
- **should handle multiple transports receiving same log**: Tests broadcast behavior
- **should handle transport removal during active logging**: Tests concurrent removal
- **should handle clearTransports during active logging**: Tests concurrent clearing
- **should handle setTransports replacement during logging**: Tests concurrent replacement

#### Custom Transport Support
- **should support custom transport implementations**: Tests custom transport interface

---

## Formatter Tests

### Formatters (`test/formatters.test.ts`)

Tests for all built-in formatter implementations.

#### LogfmtFormatter
- **should format basic log entry in logfmt style**: Tests standard logfmt output
- **should handle args in logfmt format**: Tests argument formatting
- **should handle nested data objects**: Tests nested object serialization
- **should apply colors when useColors is true**: Tests color application
- **should escape quotes in message and values**: Tests quote escaping
- **should handle entry with no data or args**: Tests minimal entry formatting
- **should handle different log levels**: Tests level name formatting

#### NdjsonFormatter
- **should format log entry as valid JSON**: Tests JSON validity
- **should include args when present**: Tests args inclusion logic
- **should not include args when empty**: Tests empty args handling
- **should flatten data into root level**: Tests data flattening
- **should apply JSON colorization when colors enabled**: Tests JSON color highlighting
- **should handle circular references safely**: Tests circular reference handling
- **should handle different log levels with colorization**: Tests level-specific colors

#### Formatter Registry
- **should export all built-in formatters**: Tests formatter availability
- **should create formatters by name**: Tests factory function
- **should provide default formatter instance**: Tests default instance
- **should handle formatter creation for all available types**: Tests all formatter types

#### Formatter Integration
- **should handle special characters and unicode**: Tests unicode and emoji handling
- **should handle very large objects**: Performance test with 100+ fields

### Custom Formatter (`test/custom-formatter.test.ts`)

Tests for custom formatter support.

- **should use custom formatter for console output**: Tests custom formatter integration
- **should use custom formatter for memory transport output**: Tests formatter with file output
- **should support formatter with structured data**: Tests data handling in custom formatter
- **should support conditional formatting based on log level**: Tests level-based formatting
- **should handle formatter errors gracefully**: Tests error handling in formatters
- **should support formatter that returns objects for JSON serialization**: Tests object return values
- **should work with logger instance using custom formatter**: Tests logger-level formatter configuration
- **should support template-based formatting**: Tests template string formatting

### Pretty Console Formatter (`test/pretty-console-formatter.test.ts`)

Tests for human-readable console output formatting.

- **formats basic log entry without colors**: Tests basic pretty formatting
- **formats log entry with structured data**: Tests data display with indentation
- **formats log entry with arguments**: Tests argument display
- **handles different data types correctly**: Tests type-specific formatting
- **wraps long messages correctly**: Tests message wrapping
- **handles nested objects with proper indentation**: Tests nested indentation
- **handles arrays properly**: Tests array formatting
- **handles Error objects correctly**: Tests error display
- **handles empty data and arguments**: Tests minimal entry formatting
- **respects custom configuration options**: Tests formatting options
- **produces multi-line output for complex entries**: Tests complex entry formatting

---

## Redaction Tests

### Redaction (`test/redaction.test.ts`)

Core redaction functionality tests.

- **should redact keys in data and args for console**: Tests key-based redaction
- **should not redact for console when redactIn is 'file'**: Tests target-specific redaction
- **should redact for file transport when redactIn is 'file'**: Tests file-specific redaction
- **should redact for both console and file when redactIn is 'both'**: Tests universal redaction
- **should handle nested object redaction**: Tests nested key redaction
- **should handle circular references in redaction**: Tests circular ref handling
- **should use case-insensitive matching when configured**: Tests case insensitivity
- **should use case-sensitive matching when configured**: Tests case sensitivity
- **should export redaction utility functions**: Tests utility function exports
- **should maintain backward compatibility with existing redaction config**: Tests legacy config
- **should use enhanced redaction context in replacement functions**: Tests context-aware redaction
- **should respect field targeting configuration**: Tests field-specific redaction
- **should handle field-specific configurations**: Tests per-field redaction rules
- **should respect maxDepth configuration**: Tests depth limiting
- **should support multiple redaction rules concurrently**: Tests rule composition

### Redaction Enhanced (`test/redaction-enhanced.test.ts`)

Advanced redaction features.

#### Nested Key Path Redaction
- **should redact nested keys using dot notation**: Tests path-based redaction (e.g., `user.password`)
- **should redact using wildcard patterns**: Tests wildcard matching (e.g., `*.token`)
- **should redact using double wildcard patterns**: Tests recursive patterns (e.g., `**.secret`)

#### Whitelist Support
- **should not redact whitelisted keys**: Tests whitelist exceptions
- **should support regex whitelist patterns**: Tests regex-based whitelists

#### Custom Redactors
- **should use custom redactor function**: Tests custom redaction logic
- **should use field-specific custom redactors**: Tests per-field custom redactors

#### Enhanced Audit System
- **should trigger custom audit hooks**: Tests audit callback execution
- **should handle audit hook errors gracefully**: Tests error handling in callbacks

#### Audit Logging
- **should log when redaction occurs if auditRedaction is enabled**: Tests audit logging
- **should not log audit messages when auditRedaction is false**: Tests disabled audit logging
- **should not log audit messages when auditRedaction is undefined**: Tests undefined audit logging

#### Utility Functions
- **shouldRedactKey should work with various patterns**: Tests key matching
- **shouldRedactValue should work with value patterns**: Tests value matching
- **redactString should replace patterns in strings**: Tests string redaction
- **redactString should work with enhanced context**: Tests context-aware redaction
- **redactLogEntry should be the unified API**: Tests main redaction API
- **should target specific fields for redaction**: Tests field targeting
- **redactObject should handle complex nested structures**: Tests deep object redaction

#### Complex Integration Tests
- **should handle mixed redaction rules correctly**: Tests rule priority and composition

### Redaction Performance (`test/redaction-performance.test.ts`)

Performance and advanced functionality tests for redaction.

#### needsRedaction Function
- **should return false when no redaction rules configured**: Tests no-op case
- **should return false when empty arrays configured**: Tests empty config
- **should return true when object contains keys that need redaction**: Tests key detection
- **should return true when object contains values that match patterns**: Tests value detection
- **should return false for primitives that don't match patterns**: Tests non-matching primitives
- **should return true for primitives that match value patterns**: Tests matching primitives
- **should handle arrays correctly**: Tests array inspection
- **should handle nested objects**: Tests deep object inspection
- **should handle circular references safely**: Tests circular ref handling
- **should handle deep nesting without stack overflow**: Tests deep recursion
- **should handle error objects safely**: Tests error object handling

#### shouldRedactKey Function
- **should match exact key names**: Tests exact matching
- **should handle case sensitivity**: Tests case-sensitive matching
- **should support key patterns with regex**: Tests regex patterns
- **should combine keys and patterns**: Tests mixed matching rules
- **should handle wildcard patterns via field configs**: Tests wildcards
- **should respect whitelist**: Tests whitelist priority

#### shouldRedactValue Function
- **should match value patterns**: Tests value pattern matching
- **should handle non-string values**: Tests type handling
- **should convert values to string for pattern matching**: Tests type coercion

#### redactObject Advanced Scenarios
- **should handle complex nested structures efficiently**: Tests deep redaction
- **should handle performance with large objects**: Performance test with large data
- **should handle maxDepth configuration**: Tests depth limiting

#### Performance Optimizations
- Tests for redaction performance with various configurations

---

## Utility Tests

### Serialization (`test/serialization.test.ts`)

Tests for JSON serialization and error handling.

#### safeStringify
- **should stringify basic types**: Tests string, number, boolean, null, undefined
- **should handle objects**: Tests object serialization
- **should handle circular references**: Tests circular reference handling

#### safeJsonStringify
- **should create valid JSON for basic objects**: Tests JSON validity
- **should handle circular references in JSON**: Tests circular ref replacement
- **should handle Error objects**: Tests error serialization

#### processLogArgs
- **should process basic arguments**: Tests basic arg handling
- **should detect complex arguments**: Tests complex arg detection

#### serializeError
- **should serialize basic error properties**: Tests error field extraction

### Bun Request Logger (`test/bun-request-logger.test.ts`)

Tests for the Bun-specific HTTP request logging middleware.

#### Basic Functionality
- **logs basic request with default options**: Tests default request logging
- **includes headers by default**: Tests header inclusion
- **redacts sensitive headers by default**: Tests built-in header redaction

#### Configuration
- **respects includeHeaders: false**: Tests header exclusion
- **includes body when includeBody: true**: Tests body inclusion
- **does not include body by default**: Tests default body exclusion
- **truncates large bodies**: Tests body size limiting
- **includes metadata when includeMeta: true**: Tests metadata inclusion
- **does not include metadata by default**: Tests metadata exclusion
- **respects fields option for fine-grained control**: Tests field selection
- **respects custom redactHeaders option**: Tests custom header redaction

#### Advanced Features
- **supports custom redaction config**: Tests full redaction config
- **uses custom log level**: Tests custom level selection
- **uses custom message prefix**: Tests prefix configuration
- **extracts remote address from server.requestIP if available**: Tests IP extraction
- **handles missing server.requestIP gracefully**: Tests missing IP handling

#### Handler Integration
- **does not interfere with handler execution**: Tests pass-through behavior
- **passes server context to handler**: Tests context forwarding
- **handles logging errors gracefully**: Tests error handling
- **works with handlers that return undefined**: Tests undefined response
- **does not consume request body for handler**: Tests body streaming

#### Log Levels and Complex Cases
- **logs all log levels correctly**: Tests all 6 log levels
- **handles complex field combinations**: Tests multiple field combinations

---

## Integration Tests

### Presets (`test/presets.test.ts`)

Tests for preset transport configuration functions.

#### useConsoleAndFile
- **should configure logger with console and file transports**: Tests basic setup
- **should configure logger with console, file, and rotation config**: Tests with rotation
- **should replace existing transports**: Tests transport replacement

#### useConsoleFileAndDiscord
- **should configure logger with console, file, and Discord transports**: Tests triple transport
- **should configure with rotation config**: Tests rotation with Discord

#### useConsoleAndWebSocket
- **should configure logger with console and WebSocket transports**: Tests WebSocket preset

#### useAllTransports
- **should configure logger with all transport types**: Tests full setup
- **should configure with all options including rotation**: Tests complete configuration

#### Add Transport Functions
- **should add file logging to existing configuration**: Tests incremental setup
- **should add file logging with rotation config**: Tests rotation addition
- **should add Discord logging to existing configuration**: Tests Discord addition
- **should add WebSocket logging to existing configuration**: Tests WebSocket addition
- **should support adding multiple transports incrementally**: Tests step-by-step building

#### Transport Management Integration
- **should work with logger transport management methods**: Tests integration
- **should handle edge cases with URLs and paths**: Tests edge case handling

---

## Test Running Commands

Run the complete test suite:

```bash
bun test
```

Run tests in watch mode:

```bash
bun run test:watch
```

Run a specific test file:

```bash
bun test test/logger.test.ts
```

Run tests with coverage:

```bash
bun run test:coverage
```

Run with verbose output:

```bash
bun test --verbose
```

Run tests with rerun count (e.g., 20 times):

```bash
bun test --rerun-each=20
```

---

## Test Utilities

The project includes `test/test-utils.ts` which provides:

- **mockConsole**: Mocked console methods (log, info, warn, error, debug)
- **Mock Bun APIs**: File system and shell operation mocks
- **MemoryTransport**: In-memory transport for capturing logs
- **resetAllMocks()**: Utility to reset all mocks between tests
- **restoreConsole()**: Utility to restore console methods

---

## Coverage Notes

The test suite provides comprehensive coverage of:

- **Core logging functionality**: All log levels, methods, and options
- **Child logger features**: Prefix composition, data inheritance, nesting
- **Transport implementations**: Console, File, Discord, WebSocket
- **Formatters**: Default, Logfmt, NDJSON, Pretty, Pretty JSON, Custom
- **Redaction system**: Key/value patterns, whitelist, custom redactors, audit hooks
- **Error handling**: Graceful degradation, recovery, edge cases
- **Performance**: Large data, deep nesting, concurrent operations
- **Integration**: Preset combinations, transport management, end-to-end scenarios

---

## Test Conventions

- Tests use Bun's native test runner (`bun:test`)
- Tests are organized by feature/module
- Mocks are set up in `beforeEach` and cleaned up in `afterEach`
- Mock transports capture logs for verification
- Error scenarios are tested with graceful failure expectations
- Performance-sensitive tests include timing assertions
