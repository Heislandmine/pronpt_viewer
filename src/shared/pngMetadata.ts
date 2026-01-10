export type PngTextChunk = {
  keyword: string;
  text: string;
  type: "tEXt" | "iTXt" | "zTXt";
};

const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const decodeText = (bytes: Uint8Array, encoding: string) => {
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
};

const findNullIndex = (bytes: Uint8Array, start = 0) => {
  for (let i = start; i < bytes.length; i += 1) {
    if (bytes[i] === 0) {
      return i;
    }
  }
  return -1;
};

const readChunkType = (bytes: Uint8Array, start: number) =>
  String.fromCharCode(...bytes.slice(start, start + 4));

export const parsePngTextChunks = (buffer: ArrayBuffer): PngTextChunk[] => {
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < pngSignature.length; i += 1) {
    if (bytes[i] !== pngSignature[i]) {
      throw new Error("PNGシグネチャが一致しません。PNGファイルを選択してください。");
    }
  }

  const dataView = new DataView(buffer);
  const chunks: PngTextChunk[] = [];
  let offset = pngSignature.length;

  while (offset + 8 <= bytes.length) {
    const length = dataView.getUint32(offset);
    const type = readChunkType(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd > bytes.length) {
      break;
    }

    const chunkData = bytes.slice(dataStart, dataEnd);

    if (type === "tEXt") {
      const splitIndex = findNullIndex(chunkData);
      if (splitIndex !== -1) {
        const keyword = decodeText(chunkData.slice(0, splitIndex), "latin1");
        const text = decodeText(chunkData.slice(splitIndex + 1), "latin1");
        chunks.push({ keyword, text, type });
      }
    }

    if (type === "iTXt") {
      const keywordEnd = findNullIndex(chunkData);
      if (keywordEnd !== -1) {
        const keyword = decodeText(chunkData.slice(0, keywordEnd), "latin1");
        let cursor = keywordEnd + 1;
        const compressionFlag = chunkData[cursor];
        cursor += 2;
        const languageEnd = findNullIndex(chunkData, cursor);
        cursor = languageEnd === -1 ? cursor : languageEnd + 1;
        const translatedEnd = findNullIndex(chunkData, cursor);
        cursor = translatedEnd === -1 ? cursor : translatedEnd + 1;
        let text = "";
        if (compressionFlag === 0) {
          text = decodeText(chunkData.slice(cursor), "utf-8");
        } else {
          text = "[compressed iTXt data not decoded]";
        }
        chunks.push({ keyword, text, type });
      }
    }

    if (type === "zTXt") {
      const splitIndex = findNullIndex(chunkData);
      if (splitIndex !== -1) {
        const keyword = decodeText(chunkData.slice(0, splitIndex), "latin1");
        chunks.push({
          keyword,
          text: "[compressed zTXt data not decoded]",
          type
        });
      }
    }

    offset = dataEnd + 4;
  }

  return chunks;
};

type ComfyUiNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
};

export type ComfyUiPromptData = {
  positivePrompt?: string;
  negativePrompt?: string;
  settings: Record<string, string>;
};

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
};

const asNode = (value: unknown): ComfyUiNode | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return {
    class_type: typeof record.class_type === "string" ? record.class_type : undefined,
    inputs: asRecord(record.inputs) ?? undefined
  };
};

const getConnectionNodeId = (value: unknown): string | null => {
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return null;
};

const coerceSimpleValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
};

export const extractComfyUiPromptData = (
  chunks: PngTextChunk[]
): ComfyUiPromptData => {
  const result: ComfyUiPromptData = {
    settings: {}
  };

  const promptChunk = chunks.find((chunk) => chunk.keyword === "prompt");
  if (!promptChunk) {
    return result;
  }

  const parsed = safeJsonParse(promptChunk.text);
  if (typeof parsed === "string") {
    result.positivePrompt = parsed;
    return result;
  }

  const parsedRecord = asRecord(parsed);
  if (!parsedRecord) {
    return result;
  }

  const nodeContainer = asRecord(parsedRecord.nodes) ?? parsedRecord;
  const nodeEntries = Object.entries(nodeContainer)
    .map(([id, value]) => ({ id, node: asNode(value) }))
    .filter((entry) => entry.node);

  const nodesById = new Map(
    nodeEntries.map((entry) => [entry.id, entry.node as ComfyUiNode])
  );

  const clipNodes = nodeEntries.filter(
    (entry) =>
      entry.node?.class_type === "CLIPTextEncode" &&
      typeof entry.node.inputs?.text === "string"
  );

  for (const entry of nodeEntries) {
    const node = entry.node;
    if (!node?.class_type || !node.inputs) {
      continue;
    }

    if (node.class_type.includes("KSampler")) {
      const positiveId = getConnectionNodeId(node.inputs.positive);
      const negativeId = getConnectionNodeId(node.inputs.negative);
      const positiveNode = positiveId ? nodesById.get(positiveId) : undefined;
      const negativeNode = negativeId ? nodesById.get(negativeId) : undefined;

      if (!result.positivePrompt && typeof positiveNode?.inputs?.text === "string") {
        result.positivePrompt = positiveNode.inputs.text;
      }

      if (!result.negativePrompt && typeof negativeNode?.inputs?.text === "string") {
        result.negativePrompt = negativeNode.inputs.text;
      }

      const settingsMap: Array<{ key: string; label: string }> = [
        { key: "steps", label: "steps" },
        { key: "cfg", label: "cfg" },
        { key: "cfg_scale", label: "cfg_scale" },
        { key: "sampler_name", label: "sampler" },
        { key: "scheduler", label: "scheduler" },
        { key: "seed", label: "seed" },
        { key: "denoise", label: "denoise" }
      ];

      for (const setting of settingsMap) {
        if (result.settings[setting.label]) {
          continue;
        }
        const value = coerceSimpleValue(node.inputs[setting.key]);
        if (value !== null) {
          result.settings[setting.label] = value;
        }
      }
    }
  }

  if (!result.positivePrompt && clipNodes[0]) {
    result.positivePrompt = clipNodes[0].node?.inputs?.text as string | undefined;
  }

  if (!result.negativePrompt && clipNodes[1]) {
    result.negativePrompt = clipNodes[1].node?.inputs?.text as string | undefined;
  }

  return result;
};
