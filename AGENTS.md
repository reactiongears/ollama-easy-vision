# Agent Guidelines for opencode-minimax-easy-vision

This document provides coding standards and build commands for AI agents working in this repository.

## Project Overview

**OpenCode MiniMax Easy Vision** is a TypeScript plugin for OpenCode that enables vision support for models that lack native image attachment support. Originally built for MiniMax models, it can be configured to work with any model that requires MCP-based image handling. It intercepts pasted images, saves them to disk, and injects MCP tool instructions so models can analyze images via the `understand_image` tool.

- **Language**: TypeScript (ES2022, strict mode)
- **Runtime**: Node.js >= 18.0.0
- **Framework**: OpenCode Plugin API (@opencode-ai/plugin v1.1.25)
- **Module System**: ES modules
- **Architecture**: Single-file functional plugin with pure utility functions

## Build Commands

### Build
```bash
npm run build
```
Compiles TypeScript from `src/` to `dist/` with declaration files.

### Install Dependencies
```bash
npm install
```

### Publish (with pre-build)
```bash
npm publish
```
Automatically runs `npm run build` via `prepublishOnly` hook.

### Test
**No test framework configured.** Manual testing requires:
1. Building the plugin: `npm run build`
2. Installing in OpenCode config: Add to `opencode.json` plugin array
3. Testing with MiniMax model and pasted images

## TypeScript Configuration

From `tsconfig.json`:
- **Target**: ES2022
- **Module**: ESNext with `moduleResolution: "bundler"`
- **Strict Mode**: Enabled (all strict flags on)
- **Additional Checks**: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`
- **Output**: `dist/` with declaration maps

## Code Style Guidelines

### Imports
- **Type-only imports**: Use `import type` for TypeScript types
  ```typescript
  import type { Plugin } from "@opencode-ai/plugin";
  import type { Message, Part, FilePart } from "@opencode-ai/sdk";
  ```
- **Node.js modules**: Use `node:` prefix
  ```typescript
  import { tmpdir } from "node:os";
  import { join } from "node:path";
  ```
- **Order**: Types first, then runtime imports (Node.js, then external packages)

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| **Files** | lowercase with extension | `index.ts` |
| **Functions** | camelCase | `isMinimaxModel`, `saveImageToTemp` |
| **Variables** | camelCase | `tempDir`, `savedImages`, `filePart` |
| **Constants** | UPPER_SNAKE_CASE | `PLUGIN_NAME`, `SUPPORTED_MIME_TYPES` |
| **Types/Interfaces** | PascalCase | `Plugin`, `FilePart`, `TextPart` |
| **Type Guards** | `is*` prefix | `isMinimaxModel`, `isImageFilePart` |

### Type Safety
- **No type suppression**: Never use `as any`, `@ts-ignore`, or `@ts-expect-error`
- **Type guards**: Use predicates with `is` keyword for type narrowing
  ```typescript
  function isImageFilePart(part: Part): part is FilePart {
    if (part.type !== "file") return false;
    const filePart = part as FilePart;
    return SUPPORTED_MIME_TYPES.has(filePart.mime?.toLowerCase() ?? "");
  }
  ```
- **Nullish coalescing**: Use `??` for default values
  ```typescript
  const userText = existingTextPart?.text ?? "";
  ```
- **Record types**: For key-value mappings
  ```typescript
  const MIME_TO_EXTENSION: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
  };
  ```

### Async/Await Patterns
- **Prefer async/await** over promise chains
- **Always await** file system operations
- **Return values** from async functions, don't mutate globals
  ```typescript
  async function saveImageToTemp(data: Buffer, mime: string): Promise<string> {
    const tempDir = await ensureTempDir();
    const ext = getExtension(mime);
    const filename = `${randomUUID()}.${ext}`;
    const filepath = join(tempDir, filename);
    await writeFile(filepath, data);
    return filepath;
  }
  ```

### Error Handling
- **Try/catch** for operations that may fail (file I/O, parsing)
- **Graceful degradation**: Log errors and continue processing
- **No empty catch blocks**: Always log or handle errors
  ```typescript
  try {
    const savedPath = await saveImageToTemp(parsed.data, parsed.mime);
    log(`Saved image to: ${savedPath}`);
    savedImages.push({ path: savedPath, mime: parsed.mime, partId: filePart.id });
  } catch (err) {
    log(`Failed to save image: ${err}`);
  }
  ```
- **Ignore non-critical failures**: Logging errors can be suppressed
  ```typescript
  .catch(() => {
    // Ignore logging errors
  });
  ```

### Functional Programming Style
- **Pure functions**: No side effects except I/O and logging
- **Small, focused functions**: Each does one thing
- **Immutability**: Don't mutate parameters; create new data structures
- **Data transformation**: Map, filter, find patterns
  ```typescript
  const imageList = imagePaths
    .map((img, idx) => `- Image ${idx + 1}: ${img.path}`)
    .join("\n");
  ```

### Documentation
- **JSDoc comments** for exported functions and constants
- **Explain "why" not "what"**: Code should be self-documenting
- **No redundant comments**: Don't describe obvious operations
  ```typescript
  /**
   * Plugin name for logging
   */
  const PLUGIN_NAME = "minimax-easy-vision";
  
  /**
   * Check if a model is a Minimax model
   */
  function isMinimaxModel(model: { providerID: string; modelID: string } | undefined): boolean {
    // Implementation...
  }
  ```

### Project Structure
```
.
├── src/
│   └── index.ts          # Main plugin implementation (all code in one file)
├── dist/                 # Compiled output (generated by tsc)
│   ├── index.js
│   ├── index.d.ts
│   └── index.d.ts.map
├── docs/                 # Documentation
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript config
└── README.md             # User-facing documentation
```

## Plugin Architecture

### Export Pattern
```typescript
// Named export
export const MinimaxEasyVisionPlugin: Plugin = async (input) => {
  // Plugin implementation
};

// Default export for OpenCode
export default MinimaxEasyVisionPlugin;
```

### Plugin Hooks
The plugin implements:
- **`experimental.chat.messages.transform`**: Intercepts messages before sending to LLM
  - Checks if current model matches configured patterns
  - Finds image parts in user messages
  - Saves images to temp directory
  - Replaces image parts with text instructions for MCP tool

### Plugin Configuration

The plugin reads configuration from a separate JSON file (not `opencode.json`).

#### Config File Locations (in order of priority)
1. **Project level**: `.opencode/opencode-minimax-easy-vision.json`
2. **User level**: `~/.config/opencode/opencode-minimax-easy-vision.json`

Project-level config takes precedence over user-level config.

#### Config File Format
```json
{
  "models": ["minimax/*", "glm/*", "openai/gpt-4-vision"]
}
```

#### Configuration Interface
```typescript
interface PluginConfig {
  models?: string[];  // Array of model patterns
}
```

#### Model Pattern Matching
Patterns use `provider/model` format with wildcard support:
- `*` - Global wildcard, matches ALL models
- `minimax/*` - All models from minimax provider
- `*/glm-4v` - Specific model from any provider
- `openai/gpt-4` - Exact match
- `*/abab*` - Contains pattern (any model with "abab" in name)

#### Default Behavior
If no configuration is provided, the plugin defaults to MiniMax-only:
```typescript
const DEFAULT_MODEL_PATTERNS: readonly string[] = ["minimax/*", "*/abab*"];
```

## Common Patterns

### Constants as Sets
```typescript
const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);
```

### Type Narrowing with Guards
```typescript
function isTextPart(part: Part): part is TextPart {
  return part.type === "text";
}

// Usage
const textPart = parts.find(isTextPart) as TextPart | undefined;
```

### Array Processing with Guards
```typescript
const hasImages = lastUserMessage.parts.some(isImageFilePart);
```

### Template Literals for Multi-line Strings
```typescript
return `The user has shared ${isSingle ? "an image" : `${imagePaths.length} images`}. The ${isSingle ? "image is" : "images are"} saved at:
${imageList}

Use the \`mcp_minimax_understand_image\` tool to analyze ${isSingle ? "this image" : "each image"}.`;
```

## Git Workflow

- **No commits unless requested**: Wait for explicit user instruction before committing
- **Build before commit**: Always run `npm run build` and verify dist/ output
- **Version bumps**: Follow semantic versioning (major.minor.patch)

## Key Dependencies

### Runtime Peer Dependency
- `@opencode-ai/plugin` (>=1.0.0): Required for plugin API

### Development Dependencies
- `@opencode-ai/plugin` (^1.1.25): Plugin framework types
- `@types/node` (^22.0.0): Node.js type definitions
- `typescript` (^5.7.0): TypeScript compiler

## Notes for Agents

1. **Single-file architecture**: All code lives in `src/index.ts`. Don't create additional modules unless absolutely necessary.
2. **No linter/formatter**: No ESLint or Prettier config. Follow the existing code style exactly.
3. **Type safety is paramount**: This project uses TypeScript strict mode. Never bypass type checking.
4. **Functional over OOP**: Use pure functions and data transformations, not classes or mutations.
5. **ES modules only**: Don't use CommonJS (`require`, `module.exports`).
6. **Minimal dependencies**: Avoid adding new dependencies unless critical. Use Node.js built-ins when possible.
7. **Error resilience**: Plugin should never crash OpenCode. Catch and log errors, continue gracefully.
