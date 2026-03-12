# Ollama Easy Vision

An [OpenCode](https://opencode.ai) plugin that adds **vision support** to any Ollama model by routing pasted images through a local vision model — no cloud APIs, no MCP server, fully self-contained.

Forked from [opencode-minimax-easy-vision](https://github.com/devadathanmb/opencode-minimax-easy-vision) and adapted for Ollama.

## The Problem

Local coding models (Qwen3-Coder-Next, DeepSeek, Llama, etc.) can't see images. When you paste a screenshot, it's silently ignored. You lose the "paste and ask" workflow that Claude and GPT provide natively.

## The Solution

This plugin intercepts pasted images and analyzes them directly via a local Ollama vision model (Qwen3-VL by default). The vision model's description is injected into the conversation as text — your coding model sees the description and acts on it.

```
You paste screenshot + "build this login page"
    ↓
[plugin] intercepts image, calls Ollama vision API
    ↓
[Qwen3-VL 8B] → "The image shows a login form with..."
    ↓
[plugin] injects description into message
    ↓
[Qwen3-Coder-Next] reads description, writes code
```

All local. No cloud APIs. No extra MCP servers. Unlimited usage.

## Prerequisites

**Ollama** running with a vision model pulled:

```bash
ollama pull qwen3-vl:8b
```

That's it. No MCP server configuration needed — the plugin calls Ollama directly.

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

### Custom Configuration

Create a config file to customize behavior:

#### Locations (Priority Order)

1. **Project level**: `.opencode/opencode-ollama-vision.json`
2. **User level**: `~/.config/opencode/opencode-ollama-vision.json`

#### Config Format

```json
{
  "models": ["ollama/*"],
  "visionModel": "qwen3-vl:8b",
  "ollamaHost": "127.0.0.1",
  "ollamaPort": 11434,
  "maxTokens": 1024
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `models` | See above | Model patterns that trigger the plugin |
| `visionModel` | `qwen3-vl:8b` | Ollama vision model for image analysis |
| `ollamaHost` | `127.0.0.1` | Ollama server host |
| `ollamaPort` | `11434` | Ollama server port |
| `maxTokens` | `1024` | Max tokens for vision model response |

#### Pattern Syntax

| Pattern | Matches |
|---------|---------|
| `*` | ALL models |
| `ollama/*` | All models from the `ollama` provider |
| `*/qwen*` | Any model starting with `qwen` from any provider |
| `*qwen*` | Any model or provider containing `qwen` |

### Alternative Vision Models

Any Ollama vision model works. Some options:

```json
{ "visionModel": "qwen3-vl:8b" }
{ "visionModel": "llava:7b" }
{ "visionModel": "llava:13b" }
{ "visionModel": "minicpm-v:8b" }
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
> *(plugin silently analyzes image via Qwen3-VL)*
>
> **Model**: Based on the image analysis, the flexbox container is missing `align-items: center`...

## How It Works

1. **Intercepts** — hooks into OpenCode's `experimental.chat.messages.transform` middleware
2. **Saves** — clipboard images are decoded from base64 and saved to `/tmp/opencode-ollama-vision/`
3. **Analyzes** — calls Ollama's `/api/generate` endpoint with the vision model and base64 image
4. **Injects** — replaces the image attachment with the vision model's text description
5. **Transparent** — the coding model never sees raw image bytes, just a detailed description

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

- Original plugin architecture by [@devadathanmb](https://github.com/devadathanmb)
- Adapted for Ollama by [@reactiongears](https://github.com/reactiongears)

## License

AGPL-3.0. See [LICENSE](./LICENSE).
