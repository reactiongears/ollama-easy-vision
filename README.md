# Opencode MiniMax Easy Vision

MiniMax Easy Vision is a plugin for [OpenCode](https://opencode.ai) that enables **vision support** for models that lack native image attachment support.

Originally built for [MiniMax](https://www.minimax.io/) models, it can be configured to work with any model that requires MCP-based image handling.

It restores the "paste and ask" workflow by automatically saving image assets and routing them through the [MiniMax Coding Plan MCP](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP)

## Demo

See how it works:

https://github.com/user-attachments/assets/df396c6c-6fa8-46b8-8984-c003ecf1c12c

https://github.com/user-attachments/assets/826f90ea-913f-427e-ace8-0b711302c497

## The Problem

When using MiniMax models (like MiniMax M2.1) in OpenCode, native image attachments aren't supported. 

These models expect the MiniMax Coding Plan MCP's `understand_image` tool, which requires an explicit file path. This breaks the normal flow:

* **Ignored images**: Pasted images are simply ignored by the model.
* **Manual steps**: You have to save screenshots manually, find the path, and reference it in your prompt.
* **Broken flow**: The "paste and ask" experience available with Claude or GPT models is lost.

## What This Plugin Does

This plugin automates the vision pipeline so you don't have to think about it.

**How it works:**

1. **Detects** when a configured model is active.
2. **Intercepts** images pasted into the chat.
3. **Saves** them to a temporary local directory.
4. **Injects** the necessary context for the model to invoke the `understand_image` tool with the correct path.

**Result:** You just paste the image and ask your question. The plugin handles the rest.

## Supported Models

By default, the plugin activates for MiniMax models:

* **Provider ID** containing `minimax`
* **Model ID** containing `minimax` or `abab`

**Examples:**
* `minimax/minimax-m2.1`
* `minimax/abab6.5s-chat`

### Custom Model Configuration

You can enable this for other models by creating a config file.

#### Locations (Priority Order)

1. **Project level**: `.opencode/opencode-minimax-easy-vision.json`
2. **User level**: `~/.config/opencode/opencode-minimax-easy-vision.json`

#### Config Format

```json
{
  "models": ["minimax/*", "opencode/*", "*/glm-4.7-free"]
}
```

#### Pattern Syntax

| Pattern          | Matches                                 |
| ---------------- | --------------------------------------- |
| `*`              | Match ALL models                        |
| `minimax/*`      | All models from the `minimax` provider  |
| `*/glm-4.7-free` | Specific model from any provider        |
| `opencode/*`     | All models from the `opencode` provider |
| `*/abab*`        | Any model containing `abab`             |

#### Wildcard Rules

* `*suffix` matches values ending with `suffix`
* `prefix*` matches values starting with `prefix`
* `*` matches everything
* `*text*` matches values containing `text`

If the config is missing or empty, it defaults to MiniMax-only behavior.

#### Configuration Examples

**Enable for all models:**

```json
{
  "models": ["*"]
}
```

**Specific providers:**

```json
{
  "models": ["minimax/*", "opencode/*", "google/*"]
}
```

**Mix of providers and models:**

```json
{
  "models": ["minimax/*", "opencode/gpt-5-nano", "*/claude-3-7-sonnet*"]
}
```

## Supported Image Formats

* PNG
* JPEG
* WebP

*(Limited by the [MiniMax Coding Plan MCP](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP) `understand_image` tool.)*

## Installation

### Via npm

Just add the plugin to the `plugin` array in your `opencode.json` file:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-minimax-easy-vision"]
}
```

### From Local Source

1. Clone the repository.
2. Build the plugin:
   ```bash
   npm install && npm run build
   ```
3. Copy the built `dist/index.js` into your OpenCode plugin directory.

## Prerequisites

The MiniMax Coding Plan MCP server must be configured in your `opencode.json`:

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

## Usage

1. Select a supported model in OpenCode.
2. Paste an image (`Cmd+V` / `Ctrl+V`).
3. Ask a question about it, just like how you do for other models with native vision support.

### Example Interaction

> **You**: [pasted screenshot] Why is this failing?
>
> **Model**: I'll check the image using the `understand_image` tool.
> `[Calls mcp_minimax_understand_image path="/tmp/xyz.png"]`
> 
> **Model**: The error suggests a syntax error on line 12.

## Development

```bash
npm install
npm run build
```

The built plugin will be available at `dist/index.js`

## License

GPL-3.0. See [LICENSE.md](./LICENSE.md)

## References

* [OpenCode Official Website](https://opencode.ai)
* [OpenCode Plugins Documentation](https://opencode.ai/docs/plugins/)
* [MiniMax Official Website](https://www.minimax.io/)
* [MiniMax Coding Plan MCP Repository](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP)
* [MiniMax API Documentation](https://platform.minimax.io/docs/guides/coding-plan-mcp-guide)
