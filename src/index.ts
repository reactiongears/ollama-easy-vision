import type { Plugin } from "@opencode-ai/plugin";
import type { Message, Part, FilePart, TextPart } from "@opencode-ai/sdk";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

/**
 * Plugin name for logging
 */
const PLUGIN_NAME = "minimax-easy-vision";

/**
 * Temp directory name for saved images
 */
const TEMP_DIR_NAME = "opencode-minimax-vision";

/**
 * Supported image MIME types (Minimax MCP limitation)
 */
const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

/**
 * Map MIME type to file extension
 */
const MIME_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

/**
 * Check if a model is a Minimax model
 */
function isMinimaxModel(
  model: { providerID: string; modelID: string } | undefined,
): boolean {
  if (!model) return false;

  const providerID = model.providerID.toLowerCase();
  const modelID = model.modelID.toLowerCase();

  return (
    providerID.includes("minimax") ||
    modelID.includes("minimax") ||
    modelID.includes("abab") // Minimax model naming convention
  );
}

/**
 * Check if a part is a FilePart with an image
 */
function isImageFilePart(part: Part): part is FilePart {
  if (part.type !== "file") return false;
  const filePart = part as FilePart;
  return SUPPORTED_MIME_TYPES.has(filePart.mime?.toLowerCase() ?? "");
}

/**
 * Check if a part is a TextPart
 */
function isTextPart(part: Part): part is TextPart {
  return part.type === "text";
}

/**
 * Parse a data URL and extract the base64 data
 */
function parseDataUrl(dataUrl: string): { mime: string; data: Buffer } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  try {
    return {
      mime: match[1],
      data: Buffer.from(match[2], "base64"),
    };
  } catch {
    return null;
  }
}

/**
 * Get file extension from MIME type
 */
function getExtension(mime: string): string {
  return MIME_TO_EXTENSION[mime.toLowerCase()] ?? "png";
}

/**
 * Ensure temp directory exists and return its path
 */
async function ensureTempDir(): Promise<string> {
  const dir = join(tmpdir(), TEMP_DIR_NAME);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Save image data to a temp file and return the path
 */
async function saveImageToTemp(data: Buffer, mime: string): Promise<string> {
  const tempDir = await ensureTempDir();
  const ext = getExtension(mime);
  const filename = `${randomUUID()}.${ext}`;
  const filepath = join(tempDir, filename);

  await writeFile(filepath, data);
  return filepath;
}

/**
 * Generate the injection prompt for the model
 */
function generateInjectionPrompt(
  imagePaths: Array<{ path: string; mime: string }>,
  userText: string,
): string {
  if (imagePaths.length === 0) return userText;

  const isSingle = imagePaths.length === 1;
  const imageList = imagePaths
    .map((img, idx) => `- Image ${idx + 1}: ${img.path}`)
    .join("\n");

  return `The user has shared ${isSingle ? "an image" : `${imagePaths.length} images`}. The ${isSingle ? "image is" : "images are"} saved at:
${imageList}

Use the \`mcp_minimax_understand_image\` tool to analyze ${isSingle ? "this image" : "each image"}. Pass the file path as \`image_source\` and describe what to look for in \`prompt\`.

User's request: ${userText || "(analyze the image)"}`;
}

/**
 * Process a message and extract/save any images
 * Returns the paths of saved images
 */
async function processMessageImages(
  parts: Part[],
  log: (msg: string) => void,
): Promise<Array<{ path: string; mime: string; partId: string }>> {
  const savedImages: Array<{ path: string; mime: string; partId: string }> = [];

  for (const part of parts) {
    if (!isImageFilePart(part)) continue;

    const filePart = part as FilePart;
    const url = filePart.url;

    // Skip if no URL
    if (!url) {
      log(`Skipping image part ${filePart.id}: no URL`);
      continue;
    }

    // Handle file:// URLs - already on disk
    if (url.startsWith("file://")) {
      const localPath = url.replace("file://", "");
      log(`Image already on disk: ${localPath}`);
      savedImages.push({
        path: localPath,
        mime: filePart.mime,
        partId: filePart.id,
      });
      continue;
    }

    // Handle data: URLs - need to save to disk
    if (url.startsWith("data:")) {
      const parsed = parseDataUrl(url);
      if (!parsed) {
        log(`Failed to parse data URL for part ${filePart.id}`);
        continue;
      }

      try {
        const savedPath = await saveImageToTemp(parsed.data, parsed.mime);
        log(`Saved image to: ${savedPath}`);
        savedImages.push({
          path: savedPath,
          mime: parsed.mime,
          partId: filePart.id,
        });
      } catch (err) {
        log(`Failed to save image: ${err}`);
      }
      continue;
    }

    // Handle HTTP/HTTPS URLs - Minimax can use these directly
    if (url.startsWith("http://") || url.startsWith("https://")) {
      log(`Image is remote URL: ${url}`);
      savedImages.push({
        path: url,
        mime: filePart.mime,
        partId: filePart.id,
      });
      continue;
    }

    log(
      `Unsupported URL scheme for part ${filePart.id}: ${url.substring(0, 50)}...`,
    );
  }

  return savedImages;
}

/**
 * The main plugin export
 */
export const MinimaxEasyVisionPlugin: Plugin = async (input) => {
  const { client } = input;

  // Simple logging helper
  const log = (msg: string) => {
    client.app
      .log({
        body: {
          service: PLUGIN_NAME,
          level: "info",
          message: msg,
        },
      })
      .catch(() => {
        // Ignore logging errors
      });
  };

  log("Plugin initialized");

  return {
    /**
     * Transform messages before they're sent to the LLM
     * This is where we intercept images and inject the MCP tool instructions
     */
    "experimental.chat.messages.transform": async (_input, output) => {
      const { messages } = output;

      // Find the last user message
      let lastUserMessage: { info: Message; parts: Part[] } | undefined;
      let lastUserIndex = -1;

      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].info.role === "user") {
          lastUserMessage = messages[i];
          lastUserIndex = i;
          break;
        }
      }

      if (!lastUserMessage) {
        return; // No user message to process
      }

      // Check if using Minimax model
      const userInfo = lastUserMessage.info as {
        model?: { providerID: string; modelID: string };
      };
      if (!isMinimaxModel(userInfo.model)) {
        return; // Not a Minimax model, skip
      }

      log("Detected Minimax model, checking for images...");

      // Check if there are any image parts
      const hasImages = lastUserMessage.parts.some(isImageFilePart);
      if (!hasImages) {
        return; // No images to process
      }

      log("Found images in message, processing...");

      // Process and save images
      const savedImages = await processMessageImages(
        lastUserMessage.parts,
        log,
      );

      if (savedImages.length === 0) {
        log("No images were successfully saved");
        return;
      }

      log(`Saved ${savedImages.length} image(s), transforming message...`);

      const existingTextPart = lastUserMessage.parts.find(isTextPart) as
        | TextPart
        | undefined;
      const userText = existingTextPart?.text ?? "";

      const transformedText = generateInjectionPrompt(
        savedImages.map((img) => ({ path: img.path, mime: img.mime })),
        userText,
      );

      const processedPartIds = new Set(savedImages.map((img) => img.partId));
      lastUserMessage.parts = lastUserMessage.parts.filter(
        (part) => !(part.type === "file" && processedPartIds.has(part.id)),
      );

      const textPartIndex = lastUserMessage.parts.findIndex(isTextPart);

      if (textPartIndex !== -1) {
        const textPart = lastUserMessage.parts[textPartIndex] as TextPart;
        textPart.text = transformedText;
      } else {
        const newTextPart: TextPart = {
          id: `transformed-${randomUUID()}`,
          sessionID: lastUserMessage.info.sessionID,
          messageID: lastUserMessage.info.id,
          type: "text",
          text: transformedText,
          synthetic: true,
        };
        lastUserMessage.parts.unshift(newTextPart);
      }

      messages[lastUserIndex] = lastUserMessage;

      log("Successfully injected image path instructions");
    },
  };
};

// Default export for OpenCode plugin loading
export default MinimaxEasyVisionPlugin;
