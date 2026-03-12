import type { Plugin } from "@opencode-ai/plugin";
import type { Message, Part, FilePart, TextPart } from "@opencode-ai/sdk";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import http from "node:http";

// Constants

const PLUGIN_NAME = "ollama-easy-vision";
const CONFIG_FILENAME = "opencode-ollama-vision.json";
const TEMP_DIR_NAME = "opencode-ollama-vision";

// Default: match all Ollama models (provider "ollama") plus common model names
const DEFAULT_MODEL_PATTERNS: readonly string[] = [
  "ollama/*",
  "*qwen*",
  "*kimi*",
  "*llama*",
  "*deepseek*",
  "*codestral*",
];

const DEFAULT_OLLAMA_HOST = "127.0.0.1";
const DEFAULT_OLLAMA_PORT = 11434;
const DEFAULT_VISION_MODEL = "qwen3-vl:8b";
const DEFAULT_MAX_TOKENS = 1024;

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

// Types

interface PluginConfig {
  models?: string[];
  visionModel?: string;
  ollamaHost?: string;
  ollamaPort?: number;
  maxTokens?: number;
}

interface SavedImage {
  path: string;
  base64: string;
  mime: string;
  partId: string;
}

interface ModelInfo {
  providerID: string;
  modelID: string;
}

type Logger = (msg: string) => void;

// Plugin State

let pluginConfig: PluginConfig = {};

// Config: Path Resolution

function getUserConfigPath(): string {
  return join(homedir(), ".config", "opencode", CONFIG_FILENAME);
}

function getProjectConfigPath(directory: string): string {
  return join(directory, ".opencode", CONFIG_FILENAME);
}

// Config: File Parsing

function parseModelsArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const models = value.filter((m): m is string => typeof m === "string");
  return models.length > 0 ? models : undefined;
}

function parseString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function parseConfigObject(raw: unknown): PluginConfig {
  if (!raw || typeof raw !== "object") return {};

  const obj = raw as Record<string, unknown>;
  return {
    models: parseModelsArray(obj.models),
    visionModel: parseString(obj.visionModel),
    ollamaHost: parseString(obj.ollamaHost),
    ollamaPort: parseNumber(obj.ollamaPort),
    maxTokens: parseNumber(obj.maxTokens),
  };
}

async function readConfigFile(
  configPath: string,
): Promise<PluginConfig | null> {
  if (!existsSync(configPath)) return null;

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    return parseConfigObject(parsed);
  } catch {
    return null;
  }
}

// Config: Precedence & Merging (project > user > defaults)

function selectWithPrecedence<T>(
  projectValue: T | undefined,
  userValue: T | undefined,
  defaultValue: T,
): { value: T; source: "project" | "user" | "default" } {
  if (projectValue !== undefined) {
    return { value: projectValue, source: "project" };
  }
  if (userValue !== undefined) {
    return { value: userValue, source: "user" };
  }
  return { value: defaultValue, source: "default" };
}

async function loadPluginConfig(directory: string, log: Logger): Promise<void> {
  const userConfig = await readConfigFile(getUserConfigPath());
  const projectConfig = await readConfigFile(getProjectConfigPath(directory));

  const modelsResult = selectWithPrecedence(
    projectConfig?.models,
    userConfig?.models,
    undefined,
  );
  if (modelsResult.source !== "default") {
    log(`Loaded models from ${modelsResult.source} config: ${modelsResult.value!.join(", ")}`);
  } else {
    log(`Using default models: ${DEFAULT_MODEL_PATTERNS.join(", ")}`);
  }

  const visionResult = selectWithPrecedence(
    projectConfig?.visionModel,
    userConfig?.visionModel,
    DEFAULT_VISION_MODEL,
  );
  log(`Vision model: ${visionResult.value} (${visionResult.source})`);

  pluginConfig = {
    models: modelsResult.value,
    visionModel: visionResult.value,
    ollamaHost: selectWithPrecedence(
      projectConfig?.ollamaHost,
      userConfig?.ollamaHost,
      DEFAULT_OLLAMA_HOST,
    ).value,
    ollamaPort: selectWithPrecedence(
      projectConfig?.ollamaPort,
      userConfig?.ollamaPort,
      DEFAULT_OLLAMA_PORT,
    ).value,
    maxTokens: selectWithPrecedence(
      projectConfig?.maxTokens,
      userConfig?.maxTokens,
      DEFAULT_MAX_TOKENS,
    ).value,
  };
}

// Config: Accessors

function getConfiguredModels(): readonly string[] {
  return pluginConfig.models ?? DEFAULT_MODEL_PATTERNS;
}

function getVisionModel(): string {
  return pluginConfig.visionModel ?? DEFAULT_VISION_MODEL;
}

function getOllamaHost(): string {
  return pluginConfig.ollamaHost ?? DEFAULT_OLLAMA_HOST;
}

function getOllamaPort(): number {
  return pluginConfig.ollamaPort ?? DEFAULT_OLLAMA_PORT;
}

function getMaxTokens(): number {
  return pluginConfig.maxTokens ?? DEFAULT_MAX_TOKENS;
}

// Ollama Vision API

function postJSON(path: string, body: unknown): Promise<{ status: number; body: string }> {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: getOllamaHost(),
        port: getOllamaPort(),
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk: Buffer) => (buf += chunk.toString()));
        res.on("end", () => resolve({ status: res.statusCode ?? 500, body: buf }));
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function analyzeImageWithOllama(
  imageBase64: string,
  userPrompt: string,
  log: Logger,
): Promise<string> {
  const model = getVisionModel();
  const prompt = userPrompt
    ? `Analyze this image in the context of the following request. Be detailed about visual elements, layout, colors, text, and any code or errors visible.\n\nUser's request: ${userPrompt}`
    : "Describe this image in detail. Include layout, visual elements, colors, text content, any code or errors visible, and UI components.";

  log(`Calling Ollama vision model: ${model}`);

  const { status, body } = await postJSON("/api/generate", {
    model,
    prompt,
    images: [imageBase64],
    stream: false,
    options: {
      num_predict: getMaxTokens(),
      temperature: 0.1,
    },
  });

  if (status !== 200) {
    log(`Ollama vision error ${status}: ${body}`);
    throw new Error(`Ollama vision API error: ${status}`);
  }

  const parsed = JSON.parse(body) as { response?: string };
  return parsed.response ?? "";
}

// Pattern Matching (supports wildcards: *, prefix*, *suffix, *contains*)

function matchesWildcardPattern(pattern: string, value: string): boolean {
  const p = pattern.toLowerCase();
  const v = value.toLowerCase();

  if (p === "*") return true;

  if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
    return v.includes(p.slice(1, -1));
  }

  if (p.endsWith("*")) {
    return v.startsWith(p.slice(0, -1));
  }

  if (p.startsWith("*")) {
    return v.endsWith(p.slice(1));
  }

  return v === p;
}

function matchesSinglePattern(pattern: string, model: ModelInfo): boolean {
  if (pattern === "*") return true;

  const slashIndex = pattern.indexOf("/");

  if (slashIndex === -1) {
    return (
      matchesWildcardPattern(pattern, model.modelID) ||
      matchesWildcardPattern(pattern, model.providerID)
    );
  }

  const providerPattern = pattern.slice(0, slashIndex);
  const modelPattern = pattern.slice(slashIndex + 1);

  return (
    matchesWildcardPattern(providerPattern, model.providerID) &&
    matchesWildcardPattern(modelPattern, model.modelID)
  );
}

function modelMatchesAnyPattern(model: ModelInfo | undefined): boolean {
  if (!model) return false;

  const patterns = getConfiguredModels();
  return patterns.some((pattern) => matchesSinglePattern(pattern, model));
}

// Type Guards

function isImageFilePart(part: Part): part is FilePart {
  if (part.type !== "file") return false;
  const mime = (part as FilePart).mime?.toLowerCase() ?? "";
  return SUPPORTED_MIME_TYPES.has(mime);
}

function isTextPart(part: Part): part is TextPart {
  return part.type === "text";
}

// Image Processing: URL Handlers

function handleFileUrl(
  url: string,
  filePart: FilePart,
  log: Logger,
): { path: string; mime: string; partId: string } | null {
  const localPath = url.replace("file://", "");
  log(`Image already on disk: ${localPath}`);
  return { path: localPath, mime: filePart.mime, partId: filePart.id };
}

function parseBase64DataUrl(
  dataUrl: string,
): { mime: string; data: Buffer; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  try {
    return {
      mime: match[1],
      data: Buffer.from(match[2], "base64"),
      base64: match[2],
    };
  } catch {
    return null;
  }
}

async function handleDataUrl(
  url: string,
  filePart: FilePart,
  log: Logger,
): Promise<SavedImage | null> {
  const parsed = parseBase64DataUrl(url);
  if (!parsed) {
    log(`Failed to parse data URL for part ${filePart.id}`);
    return null;
  }

  try {
    const savedPath = await saveImageToTemp(parsed.data, parsed.mime);
    log(`Saved image to: ${savedPath}`);
    return {
      path: savedPath,
      base64: parsed.base64,
      mime: parsed.mime,
      partId: filePart.id,
    };
  } catch (err) {
    log(`Failed to save image: ${err}`);
    return null;
  }
}

// Image Processing: File Operations

function getExtensionForMime(mime: string): string {
  return MIME_TO_EXTENSION[mime.toLowerCase()] ?? "png";
}

async function ensureTempDir(): Promise<string> {
  const dir = join(tmpdir(), TEMP_DIR_NAME);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function saveImageToTemp(data: Buffer, mime: string): Promise<string> {
  const tempDir = await ensureTempDir();
  const filename = `${randomUUID()}.${getExtensionForMime(mime)}`;
  const filepath = join(tempDir, filename);
  await writeFile(filepath, data);
  return filepath;
}

async function readFileAsBase64(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return data.toString("base64");
}

// Image Processing: Main Processor

async function processImagePart(
  filePart: FilePart,
  log: Logger,
): Promise<SavedImage | null> {
  const url = filePart.url;

  if (!url) {
    log(`Skipping image part ${filePart.id}: no URL`);
    return null;
  }

  if (url.startsWith("file://")) {
    const result = handleFileUrl(url, filePart, log);
    if (!result) return null;
    const base64 = await readFileAsBase64(result.path);
    return { ...result, base64 };
  }

  if (url.startsWith("data:")) {
    return handleDataUrl(url, filePart, log);
  }

  // For http(s) URLs, we can't easily base64 encode — skip for now
  log(`Skipping remote URL (vision requires local image): ${url.substring(0, 50)}`);
  return null;
}

async function extractImagesFromParts(
  parts: Part[],
  log: Logger,
): Promise<SavedImage[]> {
  const savedImages: SavedImage[] = [];

  for (const part of parts) {
    if (!isImageFilePart(part)) continue;

    const result = await processImagePart(part as FilePart, log);
    if (result) {
      savedImages.push(result);
    }
  }

  return savedImages;
}

// Message Transformation

function findLastUserMessage(
  messages: Array<{ info: Message; parts: Part[] }>,
): { message: { info: Message; parts: Part[] }; index: number } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info.role === "user") {
      return { message: messages[i], index: i };
    }
  }
  return null;
}

function getModelFromMessage(message: {
  info: Message;
}): ModelInfo | undefined {
  const info = message.info as { model?: ModelInfo };
  return info.model;
}

function removeProcessedImageParts(
  parts: Part[],
  processedIds: Set<string>,
): Part[] {
  return parts.filter(
    (part) => !(part.type === "file" && processedIds.has(part.id)),
  );
}

function updateOrCreateTextPart(
  message: { info: Message; parts: Part[] },
  newText: string,
): void {
  const textPartIndex = message.parts.findIndex(isTextPart);

  if (textPartIndex !== -1) {
    (message.parts[textPartIndex] as TextPart).text = newText;
  } else {
    const newTextPart: TextPart = {
      id: `transformed-${randomUUID()}`,
      sessionID: message.info.sessionID,
      messageID: message.info.id,
      type: "text",
      text: newText,
      synthetic: true,
    };
    message.parts.unshift(newTextPart);
  }
}

// Plugin Export

export const OllamaEasyVisionPlugin: Plugin = async (input) => {
  const { client, directory } = input;

  const log: Logger = (msg) => {
    client.app
      .log({ body: { service: PLUGIN_NAME, level: "info", message: msg } })
      .catch(() => {});
  };

  await loadPluginConfig(directory, log);
  log(`Plugin initialized — vision model: ${getVisionModel()}`);

  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      const { messages } = output;

      const result = findLastUserMessage(messages);
      if (!result) return;

      const { message: lastUserMessage, index: lastUserIndex } = result;

      const model = getModelFromMessage(lastUserMessage);
      if (!modelMatchesAnyPattern(model)) return;

      log("Model matched, checking for images...");

      const hasImages = lastUserMessage.parts.some(isImageFilePart);
      if (!hasImages) return;

      log("Found images in message, processing...");

      const savedImages = await extractImagesFromParts(
        lastUserMessage.parts,
        log,
      );
      if (savedImages.length === 0) {
        log("No images were successfully saved");
        return;
      }

      log(`Processing ${savedImages.length} image(s) through ${getVisionModel()}...`);

      // Get the user's original text to provide context for image analysis
      const existingTextPart = lastUserMessage.parts.find(isTextPart);
      const userText = existingTextPart?.text ?? "";

      // Analyze each image with the vision model
      const descriptions: string[] = [];
      for (let i = 0; i < savedImages.length; i++) {
        const img = savedImages[i];
        try {
          log(`Analyzing image ${i + 1}/${savedImages.length}...`);
          const description = await analyzeImageWithOllama(
            img.base64,
            userText,
            log,
          );
          descriptions.push(description);
          log(`Image ${i + 1} analyzed successfully`);
        } catch (err) {
          log(`Failed to analyze image ${i + 1}: ${err}`);
          descriptions.push(`[Image analysis failed: ${err}]`);
        }
      }

      // Build the transformed prompt with vision descriptions injected
      const isSingle = savedImages.length === 1;
      let transformedText: string;

      if (isSingle) {
        transformedText = `[Image Analysis — ${getVisionModel()}]\n${descriptions[0]}\n\n${userText || "(The user shared an image for analysis)"}`;
      } else {
        const imageDescriptions = descriptions
          .map((desc, idx) => `### Image ${idx + 1}\n${desc}`)
          .join("\n\n");
        transformedText = `[Image Analysis — ${getVisionModel()}]\n${imageDescriptions}\n\n${userText || "(The user shared images for analysis)"}`;
      }

      // Remove image parts and replace with text
      const processedIds = new Set(savedImages.map((img) => img.partId));
      lastUserMessage.parts = removeProcessedImageParts(
        lastUserMessage.parts,
        processedIds,
      );

      updateOrCreateTextPart(lastUserMessage, transformedText);
      messages[lastUserIndex] = lastUserMessage;

      log("Successfully injected vision analysis into message");
    },
  };
};

export default OllamaEasyVisionPlugin;
