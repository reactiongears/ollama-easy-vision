import type { Plugin } from "@opencode-ai/plugin";
import type { Message, Part, FilePart, TextPart } from "@opencode-ai/sdk";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

const PLUGIN_NAME = "minimax-easy-vision";
const CONFIG_FILENAME = "opencode-minimax-easy-vision.json";
const TEMP_DIR_NAME = "opencode-minimax-vision";

const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

interface PluginConfig {
  models?: string[];
}

const DEFAULT_MODEL_PATTERNS: readonly string[] = ["minimax/*", "*/abab*"];

let pluginConfig: PluginConfig = {};

function getUserConfigPath(): string {
  return join(homedir(), ".config", "opencode", CONFIG_FILENAME);
}

function getProjectConfigPath(directory: string): string {
  return join(directory, ".opencode", CONFIG_FILENAME);
}

async function loadConfigFile(
  configPath: string,
): Promise<PluginConfig | null> {
  try {
    if (!existsSync(configPath)) {
      return null;
    }
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === "object" && parsed !== null) {
      const config = parsed as Record<string, unknown>;
      if (Array.isArray(config.models)) {
        const models = config.models.filter(
          (m): m is string => typeof m === "string",
        );
        return { models };
      }
    }
    return {};
  } catch {
    return null;
  }
}

// Config precedence: project > user > defaults
async function loadPluginConfig(
  directory: string,
  log: (msg: string) => void,
): Promise<void> {
  const userConfigPath = getUserConfigPath();
  const projectConfigPath = getProjectConfigPath(directory);

  const userConfig = await loadConfigFile(userConfigPath);
  const projectConfig = await loadConfigFile(projectConfigPath);

  if (projectConfig?.models && projectConfig.models.length > 0) {
    pluginConfig = projectConfig;
    log(
      `Loaded project config from ${projectConfigPath}: ${projectConfig.models.join(", ")}`,
    );
  } else if (userConfig?.models && userConfig.models.length > 0) {
    pluginConfig = userConfig;
    log(
      `Loaded user config from ${userConfigPath}: ${userConfig.models.join(", ")}`,
    );
  } else {
    pluginConfig = {};
    log(
      `No config found, using defaults: ${DEFAULT_MODEL_PATTERNS.join(", ")}`,
    );
  }
}

// Order matters: check *text* before *text or text* to avoid false matches
function matchesPattern(pattern: string, value: string): boolean {
  const lowerPattern = pattern.toLowerCase();
  const lowerValue = value.toLowerCase();

  if (lowerPattern === "*") {
    return true;
  }

  if (
    lowerPattern.startsWith("*") &&
    lowerPattern.endsWith("*") &&
    lowerPattern.length > 2
  ) {
    const middle = lowerPattern.slice(1, -1);
    return lowerValue.includes(middle);
  }

  if (lowerPattern.endsWith("*")) {
    const prefix = lowerPattern.slice(0, -1);
    return lowerValue.startsWith(prefix);
  }

  if (lowerPattern.startsWith("*")) {
    const suffix = lowerPattern.slice(1);
    return lowerValue.endsWith(suffix);
  }

  return lowerValue === lowerPattern;
}

// Pattern format: "provider/model" with wildcards. No slash = match against both.
function modelMatchesPatterns(
  model: { providerID: string; modelID: string } | undefined,
  patterns: readonly string[],
): boolean {
  if (!model) return false;

  for (const pattern of patterns) {
    if (pattern === "*") {
      return true;
    }

    const slashIndex = pattern.indexOf("/");

    if (slashIndex === -1) {
      if (matchesPattern(pattern, model.modelID)) {
        return true;
      }
      if (matchesPattern(pattern, model.providerID)) {
        return true;
      }
    } else {
      const providerPattern = pattern.slice(0, slashIndex);
      const modelPattern = pattern.slice(slashIndex + 1);

      const providerMatches = matchesPattern(providerPattern, model.providerID);
      const modelMatches = matchesPattern(modelPattern, model.modelID);

      if (providerMatches && modelMatches) {
        return true;
      }
    }
  }

  return false;
}

function shouldApplyVisionHook(
  model: { providerID: string; modelID: string } | undefined,
): boolean {
  const patterns =
    pluginConfig.models && pluginConfig.models.length > 0
      ? pluginConfig.models
      : DEFAULT_MODEL_PATTERNS;

  return modelMatchesPatterns(model, patterns);
}

function isImageFilePart(part: Part): part is FilePart {
  if (part.type !== "file") return false;
  const filePart = part as FilePart;
  return SUPPORTED_MIME_TYPES.has(filePart.mime?.toLowerCase() ?? "");
}

function isTextPart(part: Part): part is TextPart {
  return part.type === "text";
}

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

function getExtension(mime: string): string {
  return MIME_TO_EXTENSION[mime.toLowerCase()] ?? "png";
}

async function ensureTempDir(): Promise<string> {
  const dir = join(tmpdir(), TEMP_DIR_NAME);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function saveImageToTemp(data: Buffer, mime: string): Promise<string> {
  const tempDir = await ensureTempDir();
  const ext = getExtension(mime);
  const filename = `${randomUUID()}.${ext}`;
  const filepath = join(tempDir, filename);

  await writeFile(filepath, data);
  return filepath;
}

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

async function processMessageImages(
  parts: Part[],
  log: (msg: string) => void,
): Promise<Array<{ path: string; mime: string; partId: string }>> {
  const savedImages: Array<{ path: string; mime: string; partId: string }> = [];

  for (const part of parts) {
    if (!isImageFilePart(part)) continue;

    const filePart = part as FilePart;
    const url = filePart.url;

    if (!url) {
      log(`Skipping image part ${filePart.id}: no URL`);
      continue;
    }

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

export const MinimaxEasyVisionPlugin: Plugin = async (input) => {
  const { client, directory } = input;

  const log = (msg: string) => {
    client.app
      .log({
        body: {
          service: PLUGIN_NAME,
          level: "info",
          message: msg,
        },
      })
      .catch(() => {});
  };

  await loadPluginConfig(directory, log);

  log("Plugin initialized");

  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      const { messages } = output;

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
        return;
      }

      const userInfo = lastUserMessage.info as {
        model?: { providerID: string; modelID: string };
      };

      if (!shouldApplyVisionHook(userInfo.model)) {
        return;
      }

      log("Model matched, checking for images...");

      const hasImages = lastUserMessage.parts.some(isImageFilePart);
      if (!hasImages) {
        return;
      }

      log("Found images in message, processing...");

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

export default MinimaxEasyVisionPlugin;
