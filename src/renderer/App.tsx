import { useState } from "react";
import { extractComfyUiPromptData, parsePngTextChunks } from "@shared/pngMetadata";

const App = () => {
  const [chunks, setChunks] = useState<PngTextChunk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFilename(file.name);
    setError(null);
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
    setImageUrl(URL.createObjectURL(file));

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parsePngTextChunks(buffer);
      setChunks(parsed);
    } catch (parseError) {
      setChunks([]);
      setError(
        parseError instanceof Error
          ? parseError.message
          : "PNGの読み込みに失敗しました。"
      );
    }
  };

  const payload = extractComfyUiPromptData(chunks);
  const settingsEntries = Object.entries(payload.settings);

  return (
    <div className="app">
      <header className="hero">
        <p className="kicker">ComfyUI PNG Inspector</p>
        <h1>プロンプトと生成設定を抽出</h1>
        <p className="lead">
          ComfyUIで生成したPNGに埋め込まれたpromptや生成設定を読み取って
          表示します。
        </p>
      </header>

      <section className="layout">
        <div className="left">
          <section className="panel upload">
            <label className="file-label">
              <input
                type="file"
                accept="image/png"
                onChange={handleFileChange}
              />
              <span>PNGファイルを選択</span>
            </label>
            {filename && <p className="filename">{filename}</p>}
            {error && <p className="error">{error}</p>}
          </section>

          {imageUrl && (
            <section className="panel">
              <h2>読み込み画像</h2>
              <div className="image-preview">
                <img src={imageUrl} alt={filename ?? "読み込んだPNG"} />
              </div>
            </section>
          )}
        </div>

        <aside className="side-panel">
          <div className="card">
            <h2>ポジティブプロンプト</h2>
            <pre>{payload.positivePrompt ?? "未検出"}</pre>
          </div>
          <div className="card">
            <h2>ネガティブプロンプト</h2>
            <pre>{payload.negativePrompt ?? "未検出"}</pre>
          </div>
          <div className="card">
            <h2>生成設定</h2>
            {settingsEntries.length === 0 ? (
              <p className="muted">未検出</p>
            ) : (
              <dl className="settings">
                {settingsEntries.map(([key, value]) => (
                  <div key={key} className="settings-row">
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
};

export default App;
