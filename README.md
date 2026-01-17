# MiniMax Easy Vision

**MiniMax Easy Vision** is a powerful plugin for [OpenCode](https://opencode.ai) that bridges the vision gap for [MiniMax](https://www.minimax.io/) models. It enables a seamless "paste and ask" workflow by automatically handling image assets and instructing the [MiniMax Coding Plan MCP](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP) to process them.

---

## Demo

See the demo to see how it works:

<!-- [INSERT VIDEO DEMO HERE] -->
*(Placeholder for Video Demo)*

---

## The Problem

When using [MiniMax](https://www.minimax.io/) models (such as MiniMax M2.1) within [OpenCode](https://opencode.ai), developers often face a frustrating hurdle: native image attachments aren't supported. Instead, these models rely on the [MiniMax Coding Plan MCP](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP)'s `understand_image` tool, which requires an explicit file path or URL.

This creates a significant workflow disruption:
- **Ignored Assets**: Images pasted directly into the chat are simply ignored by MiniMax models.
- **Manual Overhead**: Developers are forced to manually save screenshots, find their file paths, and type them out—breaking the flow of natural interaction.
- **UX Friction**: The seamless "paste and ask" experience found with other models like Claude or GPT is lost.

## The Solution

**MiniMax Easy Vision** restores the intuitive vision experience you expect from a modern AI assistant. It automates the entire image-handling pipeline, allowing you to interact with visual data without leaving your chat flow.

The plugin works silently in the background to:
1. **Intelligent Detection**: Automatically identifies when a MiniMax model is active.
2. **Seamless Interception**: Captures images pasted into the chat in real-time.
3. **Automated Storage**: Securely saves these images to a temporary local directory.
4. **Context Injection**: Transparently provides the model with the necessary instructions and file paths to invoke the `understand_image` MCP tool.

The result? You can paste images just as you would with any other top-tier model, and they "just work" with MiniMax.

---

## Supported Models

This plugin activates only for MiniMax models, identified by:
- **Provider ID** containing "minimax"
- **Model ID** containing "minimax" or "abab" (the standard MiniMax naming convention)

**Examples:**
- `minimax/minimax-m2.1`
- `minimax/abab6.5s-chat`

*Note: Non-MiniMax models are not affected—images work normally with their native vision capabilities.*

## Supported Image Formats

- **PNG**
- **JPEG**
- **WebP**

*(These formats are dictated by the limitations of the [MiniMax Coding Plan MCP](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP) `understand_image` tool.)*

---

## Installation

### Via npm

Add the plugin to the `plugin` array in your `opencode.json` configuration file:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-minimax-easy-vision"]
}
```

### From Local Source

1. **Clone/Download** this repository.
2. **Build** the plugin:
   ```bash
   npm install
   npm run build
   ```
3. **Deploy** the built `dist/index.js` to your OpenCode plugin directory:
   - **Project-level**: `.opencode/plugin/minimax-easy-vision.js`
   - **Global**: `~/.config/opencode/plugin/minimax-easy-vision.js`

---

## Prerequisites

To use this plugin, you must have the [MiniMax Coding Plan MCP](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP) server configured in your `opencode.json`:

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

For more setup details, refer to the [MiniMax Coding Plan MCP documentation](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP) and the [MiniMax API Documentation](https://platform.minimax.io/docs/guides/coding-plan-mcp-guide).

---

## Usage

1. **Start OpenCode** with a supported MiniMax model selected.
2. **Paste an image** into the chat (`Cmd+V` / `Ctrl+V`).
3. **Type your question** regarding the image.
4. **Automated Processing**:
   - The plugin saves the image to `{tmpdir}/opencode-minimax-vision/<uuid>.<ext>`.
   - It injects instructions for the model to use the `understand_image` tool.
5. **Model Analysis**: The model automatically calls the MCP tool to analyze your image and provides a response.

### Example Interaction

```text
You: [pasted screenshot] What does this error message say?

# Plugin automatically injects:
# [SYSTEM: Image Attachment Detected]
# 1 image has been saved to: /tmp/opencode-minimax-vision/abc123.png
# To analyze this image, use the understand_image MCP tool...

Model: I'll analyze the screenshot using the understand_image tool.
[Calls mcp_minimax_understand_image with the saved path]
Model: The error message indicates a "TypeError: Cannot read property 'foo' of undefined"...
```

---

## Limitations

1. **Experimental Hook**: Utilizes `experimental.chat.messages.transform`, which may be subject to change in future OpenCode versions.
2. **Temp File Persistence**: Saved images persist until the operating system cleans the temporary directory.
3. **Format Support**: Restricted to JPEG, PNG, and WebP (matching MiniMax MCP capabilities).
4. **Local Access**: Saved images must be accessible to the MCP server (i.e., on the same machine).
5. **Unsupported Formats**: Animated GIFs and other non-standard formats are skipped.

---

## Development

Set up your local environment for development:

```bash
# Install dependencies
npm install

# Build the project
npm run build

# The built plugin is available in dist/index.js
```

---

## License

Distributed under the **GPL-3.0 License**. See the [LICENSE.md](LICENSE.md) file for full details.

---

## References & Resources

- [OpenCode Official Website](https://opencode.ai)
- [OpenCode Plugins Documentation](https://opencode.ai/docs/plugins/)
- [MiniMax Official Website](https://www.minimax.io/)
- [MiniMax Coding Plan MCP Repository](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP)
- [MiniMax API Documentation](https://platform.minimax.io/docs/guides/coding-plan-mcp-guide)
