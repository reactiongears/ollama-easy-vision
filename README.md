# Opencode MiniMax Easy Vision

MiniMax Easy Vision is a plugin for [OpenCode](https://opencode.ai) that enables **vision support** for models that lack native image attachment support. Originally built for [MiniMax](https://www.minimax.io/) models, it can be configured to work with any model that requires MCP-based image handling. It restores a simple "paste and ask" workflow by automatically handling image assets and routing them through the [MiniMax Coding Plan MCP](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP).

## Demo

See how it works:

https://github.com/user-attachments/assets/df396c6c-6fa8-46b8-8984-c003ecf1c12c

https://github.com/user-attachments/assets/826f90ea-913f-427e-ace8-0b711302c497

## The Problem

When using MiniMax models (for example, MiniMax M2.1) inside OpenCode, users run into a limitation: **vision is not supported via native image attachments**.

MiniMax models rely on the MiniMax Coding Plan MCP's `understand_image` tool, which requires an explicit file path or URL. This breaks the normal chat workflow:

* **Ignored images**: Images pasted directly into chat are ignored by MiniMax models.
* **Manual steps**: Users must save screenshots, locate file paths, and reference them manually.
* **Broken flow**: The "paste and ask" vision workflow available in other models is lost.

## What This Plugin Does

This plugin removes that friction by automating the vision pipeline for configured models.

Internally, it:

1. Detects when a configured model is active (MiniMax by default)
2. Intercepts images pasted into the chat
3. Saves them to a temporary local directory
4. Injects the required context so the model can invoke the `understand_image` MCP tool with the correct file path

From the user's perspective, pasted images simply work with vision, just like how it works out of the box with other vision-capable models like Claude.

## Supported Models

By default, the plugin activates for MiniMax models, identified by:

* **Provider ID** containing `minimax`
* **Model ID** containing `minimax` or `abab`

Examples:

* `minimax/minimax-m2.1`
* `minimax/abab6.5s-chat`

### Custom Model Configuration

You can configure which models the plugin applies to by creating a config file.

#### Config File Locations

The plugin looks for configuration in these locations (in order of priority):

1. **Project level**: `.opencode/opencode-minimax-easy-vision.json`
2. **User level**: `~/.config/opencode/opencode-minimax-easy-vision.json`

Project-level config takes precedence over user-level config.

#### Config File Format

```json
{
  "models": ["minimax/*", "glm/*", "openai/gpt-4-vision"]
}
```

#### Pattern Syntax

Model patterns use a `provider/model` format with wildcard support:

| Pattern        | Description                                         |
| -------------- | --------------------------------------------------- |
| `*`            | Match ALL models (global wildcard)                  |
| `minimax/*`    | Match all models from the `minimax` provider        |
| `*/glm-4v`     | Match `glm-4v` model from any provider              |
| `openai/gpt-4` | Exact match for provider and model                  |
| `*/abab*`      | Match any model containing `abab` from any provider |

#### Wildcard Rules

* `*` at the start matches any prefix: `*suffix` matches values ending with `suffix`
* `*` at the end matches any suffix: `prefix*` matches values starting with `prefix`
* `*` alone matches everything
* `*text*` matches values containing `text`

#### Precedence

When multiple patterns are specified, the first matching pattern wins. If the `models` array is empty or the config file doesn't exist, the plugin falls back to default MiniMax-only behavior.

#### Examples

**Enable for all models:**

```json
{
  "models": ["*"]
}
```

**Enable for specific providers:**

```json
{
  "models": ["minimax/*", "glm/*", "zhipu/*"]
}
```

**Mix of providers and specific models:**

```json
{
  "models": ["minimax/*", "openai/gpt-4-vision", "*/claude-3*"]
}
```

## Supported Image Formats

* PNG
* JPEG
* WebP

*(These formats are dictated by the limitations of the [MiniMax Coding Plan MCP](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP) `understand_image` tool.)*

## Installation

### Via npm

Add the plugin to the `plugin` array in your `opencode.json` file:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-minimax-easy-vision"]
}
```

### From local source

1. Clone or download this repository
2. Build the plugin:

   ```bash
   npm install
   npm run build
   ```
3. Copy the built file to your OpenCode plugin directory:

   * Project-level: `.opencode/plugin/minimax-easy-vision.js`
   * Global: `~/.config/opencode/plugin/minimax-easy-vision.js`

## Prerequisites

The MiniMax Coding Plan MCP server must be configured in `opencode.json`:

```json
{
  "mcp": {
    "MiniMax": {
      "command": "uvx",
      "args": ["minimax-coding-plan-mcp"],
      "env": {
        "MINIMAX_API_KEY": "your-api-key-here",
        "MINIMAX_API_HOST": "https://api.minimax.io"
      }
    }
  }
}
```

For full setup details, refer to the MiniMax Coding Plan MCP and MiniMax API documentation.

## Usage

1. Start OpenCode with a supported model (MiniMax by default, or any configured model)
2. Paste an image into the chat (`Cmd+V` / `Ctrl+V`)
3. Ask a question about the image

What happens internally:

* The image is saved to `{tmpdir}/opencode-minimax-vision/<uuid>.<ext>`
* Instructions are injected for the model to use the `understand_image` MCP tool
* The model performs vision analysis and responds

### Example interaction

```text
You: [pasted screenshot] What does this error message say?

# Automatically injected:
# [SYSTEM: Image Attachment Detected]
# 1 image has been saved to: /tmp/opencode-minimax-vision/abc123.png
# To analyze this image, use the understand_image MCP tool...

Model: I'll analyze the screenshot using the understand_image tool.
[Calls mcp_minimax_understand_image with the saved path]
Model: The error message indicates a "TypeError: Cannot read property 'foo' of undefined"...
```

## Development

```bash
npm install
npm run build
```

The built plugin will be available at `dist/index.js`.

## License

GPL-3.0. See [LICENSE.md](./LICENCE.md) for details.

## References

* [OpenCode Official Website](https://opencode.ai)
* [OpenCode Plugins Documentation](https://opencode.ai/docs/plugins/)
* [MiniMax Official Website](https://www.minimax.io/)
* [MiniMax Coding Plan MCP Repository](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP)
* [MiniMax API Documentation](https://platform.minimax.io/docs/guides/coding-plan-mcp-guide)
