# Ollama Easy Vision

An [OpenCode](https://opencode.ai) plugin that adds **vision support** to any Ollama model by routing pasted images through a local vision model via MCP.

Forked from [opencode-minimax-easy-vision](https://github.com/devadathanmb/opencode-minimax-easy-vision) and adapted for Ollama + [vision-mcp](https://github.com/arealicehole/vision-mcp).

## The Problem

Local coding models (Qwen3-Coder-Next, DeepSeek, Llama, etc.) can't see images. When you paste a screenshot, it's silently ignored. You lose the "paste and ask" workflow that Claude and GPT provide natively.

## The Solution

This plugin intercepts pasted images, saves them to disk, and injects instructions for the model to call a vision MCP tool. A separate vision model (like Qwen3-VL) analyzes the image and returns a text description that the coding model can act on.

```
You paste screenshot + "build this login page"
    ↓
[plugin] saves image, rewrites prompt
    ↓
[Qwen3-Coder-Next] calls vision.describe tool
    ↓
[vision-mcp] → [Qwen3-VL via Ollama] → text description
    ↓
[Qwen3-Coder-Next] writes the code
```

All local. No cloud APIs. Unlimited usage.

## Prerequisites

1. **Ollama** running with a vision model pulled:
   ```bash
   ollama pull qwen3-vl:8b
   ```

2. **vision-mcp** server configured in your `opencode.json`:
   ```json
   {
     "mcp": {
       "vision": {
         "type": "local",
         "command": ["node", "/path/to/vision-mcp/vision-mcp.mjs"],
         "env": {
           "VISION_MODEL": "qwen3-vl:8b"
         },
         "enabled": true
       }
     }
   }
   ```

## Installation

Add the plugin to your `opencode.json`:

```json
{
  "plugin": ["opencode-ollama-easy-vision"]
}
```

## Supported Models

By default, the plugin activates for common Ollama model patterns:

- `ollama/*` — All Ollama-provided models
- `*qwen*` — Qwen models
- `*kimi*` — Kimi models
- `*llama*` — Llama models
- `*deepseek*` — DeepSeek models
- `*codestral*` — Codestral models

### Custom Model Configuration

Create a config file to customize which models trigger the plugin:

#### Locations (Priority Order)

1. **Project level**: `.opencode/opencode-ollama-vision.json`
2. **User level**: `~/.config/opencode/opencode-ollama-vision.json`

#### Config Format

```json
{
  "models": ["ollama/*", "*/my-custom-model"],
  "imageAnalysisTool": "mcp_vision_vision_describe"
}
```

#### Pattern Syntax

| Pattern | Matches |
|---------|---------|
| `*` | ALL models |
| `ollama/*` | All models from the `ollama` provider |
| `*/qwen*` | Any model starting with `qwen` from any provider |
| `*qwen*` | Any model or provider containing `qwen` |

### Custom Image Analysis Tool

The default tool is `mcp_vision_vision_describe` from [vision-mcp](https://github.com/arealicehole/vision-mcp). You can point to any MCP tool that accepts an image path:

```json
{
  "imageAnalysisTool": "mcp_my_custom_vision_tool"
}
```

## Supported Image Formats

- PNG
- JPEG
- WebP

## Usage

1. Select an Ollama model in OpenCode.
2. Paste an image (`Cmd+V`).
3. Ask your question — the plugin handles the rest.

### Example

> **You**: [pasted screenshot] Why is this layout broken?
>
> **Model**: I'll analyze the image using the vision tool.
> `[Calls mcp_vision_vision_describe path="/tmp/xyz.png"]`
>
> **Model**: The flexbox container is missing `align-items: center`...

## Development

```bash
npm install
npm run build
```

For local development, symlink the built plugin:

```bash
mkdir -p ~/.config/opencode/plugin
ln -sf $(pwd)/dist/index.js ~/.config/opencode/plugin/ollama-easy-vision.js
```

## Credits

- Original plugin by [@devadathanmb](https://github.com/devadathanmb)
- Vision MCP server by [@arealicehole](https://github.com/arealicehole)

## License

AGPL-3.0. See [LICENSE](./LICENSE).
