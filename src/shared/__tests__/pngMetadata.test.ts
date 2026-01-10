import { describe, expect, it } from "vitest";
import { extractComfyUiPromptData, parsePngTextChunks } from "../pngMetadata";

const makeChunk = (type: string, data: Uint8Array) => {
  const length = data.length;
  const buffer = new Uint8Array(8 + length + 4);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, length);
  buffer.set(type.split("").map((char) => char.charCodeAt(0)), 4);
  buffer.set(data, 8);
  return buffer;
};

const makeTextChunk = (keyword: string, value: string) => {
  const keywordBytes = new TextEncoder().encode(keyword);
  const valueBytes = new TextEncoder().encode(value);
  const data = new Uint8Array(keywordBytes.length + 1 + valueBytes.length);
  data.set(keywordBytes, 0);
  data[keywordBytes.length] = 0;
  data.set(valueBytes, keywordBytes.length + 1);
  return makeChunk("tEXt", data);
};

const makeItxtChunk = (keyword: string, value: string) => {
  const keywordBytes = new TextEncoder().encode(keyword);
  const textBytes = new TextEncoder().encode(value);
  const data = new Uint8Array(
    keywordBytes.length + 1 + 2 + 1 + 1 + textBytes.length
  );
  let cursor = 0;
  data.set(keywordBytes, cursor);
  cursor += keywordBytes.length;
  data[cursor] = 0;
  cursor += 1;
  data[cursor] = 0;
  data[cursor + 1] = 0;
  cursor += 2;
  data[cursor] = 0;
  cursor += 1;
  data[cursor] = 0;
  cursor += 1;
  data.set(textBytes, cursor);
  return makeChunk("iTXt", data);
};

const makePng = (chunks: Uint8Array[]) => {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const totalLength =
    signature.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new Uint8Array(totalLength);
  let offset = 0;
  buffer.set(signature, offset);
  offset += signature.length;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  return buffer.buffer;
};

describe("parsePngTextChunks", () => {
  it("reads tEXt chunks", () => {
    const png = makePng([makeTextChunk("prompt", "{\"a\":1}")]);
    const chunks = parsePngTextChunks(png);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].keyword).toBe("prompt");
  });

  it("reads iTXt chunks", () => {
    const png = makePng([makeItxtChunk("workflow", "{\"nodes\":[]}")]);
    const chunks = parsePngTextChunks(png);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("iTXt");
  });
});

describe("extractComfyUiPromptData", () => {
  it("extracts prompts and sampler settings", () => {
    const prompt = JSON.stringify({
      "1": {
        class_type: "CLIPTextEncode",
        inputs: {
          text: "a cat"
        }
      },
      "2": {
        class_type: "CLIPTextEncode",
        inputs: {
          text: "blurry"
        }
      },
      "3": {
        class_type: "KSampler",
        inputs: {
          steps: 20,
          cfg: 7.5,
          sampler_name: "euler",
          scheduler: "normal",
          positive: ["1", 0],
          negative: ["2", 0]
        }
      }
    });
    const png = makePng([makeTextChunk("prompt", prompt)]);
    const chunks = parsePngTextChunks(png);
    const payload = extractComfyUiPromptData(chunks);
    expect(payload.positivePrompt).toBe("a cat");
    expect(payload.negativePrompt).toBe("blurry");
    expect(payload.settings.steps).toBe("20");
    expect(payload.settings.cfg).toBe("7.5");
    expect(payload.settings.sampler).toBe("euler");
    expect(payload.settings.scheduler).toBe("normal");
  });
});
