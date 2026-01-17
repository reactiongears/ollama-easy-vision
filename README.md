# MiniMax Easy Vision

MiniMax Easy Vision is a plugin for [OpenCode](https://opencode.ai) that enables **vision support** when using [MiniMax](https://www.minimax.io/) models. It restores a simple “paste and ask” workflow by automatically handling image assets and routing them through the [MiniMax Coding Plan MCP](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP)

## Demo

See how it works:

https://github.com/user-attachments/assets/df396c6c-6fa8-46b8-8984-c003ecf1c12c

https://github.com/user-attachments/assets/826f90ea-913f-427e-ace8-0b711302c497

## The Problem

When using MiniMax models (for example, MiniMax M2.1) inside OpenCode, users run into a limitation: **vision is not supported via native image attachments**.

MiniMax models rely on the MiniMax Coding Plan MCP’s `understand_image` tool, which requires an explicit file path or URL. This breaks the normal chat workflow:

* **Ignored images**: Images pasted directly into chat are ignored by MiniMax models.
* **Manual steps**: Users must save screenshots, locate file paths, and reference them manually.
* **Broken flow**: The “paste and ask” vision workflow available in other models is lost.

## What This Plugin Does

This plugin removes that friction by automating the vision pipeline for MiniMax models.

Internally, it:

1. Detects when a MiniMax model is active
2. Intercepts images pasted into the chat
3. Saves them to a temporary local directory
4. Injects the required context so the model can invoke the `understand_image` MCP tool with the correct file path

From the user’s perspective, pasted images simply work with MiniMax vision.

## Supported Models

The plugin activates only for MiniMax models, identified by:

* **Provider ID** containing `minimax`
* **Model ID** containing `minimax` or `abab`

Examples:

* `minimax/minimax-m2.1`
* `minimax/abab6.5s-chat`

Non-MiniMax models are not affected. Their native vision support continues to work normally.

## Supported Image Formats

* PNG
* JPEG
* WebP

These formats match the constraints of the MiniMax Coding Plan MCP `understand_image` tool.

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

1. Start OpenCode with a supported MiniMax model
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

## Limitations

* Uses `experimental.chat.messages.transform`, which may change in future OpenCode versions
* Images persist until the OS clears the temporary directory
* Only JPEG, PNG, and WebP are supported
* The MCP server must have access to the local filesystem
* Animated GIFs and unsupported formats are skipped

## Development

```bash
npm install
npm run build
```

The built plugin will be available at `dist/index.js`.

## License

GPL-3.0. See `LICENSE.md` for details.

## References

* [https://opencode.ai](https://opencode.ai)
* [https://opencode.ai/docs/plugins/](https://opencode.ai/docs/plugins/)
* [https://www.minimax.io/](https://www.minimax.io/)
* [https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP)
* [https://platform.minimax.io/docs/guides/coding-plan-mcp-guide](https://platform.minimax.io/docs/guides/coding-plan-mcp-guide)
