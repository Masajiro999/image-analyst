# 👁️ Gemini Agentic Vision Web App

**Gemini 3 Flash Agentic Vision** を活用した高精度画像分析Webアプリケーション

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Node](https://img.shields.io/badge/node-18%2B-green)
![License](https://img.shields.io/badge/license-MIT-purple)

---

## 🌟 特徴

- **Agentic Vision**: Think-Act-Observe ループによる能動的な画像分析
- **コード実行**: Python (OpenCV, PIL, NumPy) によるピクセルレベルの画像処理
- **リアルタイムストリーミング**: 分析進捗をリアルタイムで表示
- **モダンUI**: ダークテーマ、グラスモーフィズム、アニメーション
- **ドラッグ&ドロップ**: 画像を簡単にアップロード

---

## 🚀 クイックスタート

### 1. リポジトリをクローン

```bash
git clone https://github.com/yourname/gemini-agentic-vision.git
cd gemini-agentic-vision
```

### 2. 依存関係をインストール

```bash
npm install
```

### 3. 環境変数を設定

```bash
cp .env.example .env
```

`.env` ファイルを編集して Gemini API キーを設定:

```env
GEMINI_API_KEY=your_api_key_here
```

> 📝 API キーは [Google AI Studio](https://aistudio.google.com/apikey) から取得できます

### 4. 開発サーバーを起動

**2つのターミナルで実行:**

```bash
# ターミナル1: APIサーバー
npm run server

# ターミナル2: フロントエンド
npm run dev
```

### 5. ブラウザでアクセス

http://localhost:5173/ を開く

---

## 📁 プロジェクト構成

```
gemini-agentic-vision/
├── server.js        # Express APIサーバー
├── index.html       # メインHTML
├── main.js          # フロントエンドロジック
├── styles.css       # CSSスタイル
├── vite.config.js   # Vite設定
├── package.json     # プロジェクト設定
├── .env.example     # 環境変数テンプレート
└── 設計書.md        # 詳細設計ドキュメント
```

---

## 🎯 使い方

### 画像をアップロード

1. **ドラッグ&ドロップ**: 画像をドロップゾーンにドラッグ
2. **クリック選択**: ドロップゾーンをクリックしてファイルを選択
3. **ペースト**: クリップボードから `Ctrl+V` でペースト

### 分析指示を入力

テキストエリアに分析したい内容を入力:

```
例:
- この画像から赤色の物体を検出してバウンディングボックスを描画してください
- 画像内のテキストをすべて抽出してください
- テーブルを解析してJSONで出力してください
```

### クイックプロンプト

よく使う分析タイプはボタンで簡単に選択:

| ボタン | 説明 |
|-------|------|
| 🔍 詳細分析 | 画像を詳細に分析 |
| 📝 OCR | テキスト抽出 |
| 📦 物体検出 | 物体検出とバウンディングボックス |
| 📊 テーブル解析 | テーブル構造の解析 |

---

## 🔧 API リファレンス

### POST `/api/vision`

画像を分析するエンドポイント

#### リクエスト

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `imageBase64` | string | ○ | Base64エンコードされた画像 |
| `prompt` | string | ○ | 分析指示 |
| `thinkingLevel` | string | - | `minimal`, `low`, `medium`, `high` |
| `streaming` | boolean | - | ストリーミングモード |

#### レスポンス

```json
{
  "success": true,
  "text": "分析結果テキスト",
  "code": ["実行されたPythonコード"],
  "codeResults": ["コード実行結果"],
  "parsedData": {
    "analysis": "画像分析の説明",
    "processed_image_base64": "...",
    "metadata": {
      "detections": [],
      "measurements": {},
      "confidence": 0.95
    },
    "summary": "処理結果の要約"
  }
}
```

---

## ⚙️ 設定

### モデル変更

`server.js` の46-47行目でモデルを変更:

```javascript
const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',  // または 'gemini-2.5-flash'
    tools: [{ codeExecution: {} }],
    generationConfig: {
        temperature: 0.2
    }
});
```

### 利用可能なモデル

| モデル | 説明 |
|-------|------|
| `gemini-3-flash-preview` | 最新版、Agentic Vision対応 |
| `gemini-2.5-flash` | 安定版 |

---

## 🎨 スクリーンショット

### メイン画面
- ダークテーマのモダンUI
- 左パネル: 画像アップロード・プロンプト入力
- 右パネル: 分析結果・処理画像・実行コード

---

## 📚 技術スタック

| カテゴリ | 技術 |
|---------|------|
| **フロントエンド** | Vanilla JS, Vite |
| **バックエンド** | Node.js, Express |
| **AI** | Gemini 3 Flash, Agentic Vision |
| **画像処理** | OpenCV, PIL (サーバーサイド) |

---

## 🔍 Agentic Vision とは

従来のマルチモーダルAIとは異なり、**Agentic Vision** は能動的に画像を分析します:

```
┌─────────────────┐
│  1. THINK       │ → 分析計画を立案
└────────┬────────┘
         ▼
┌─────────────────┐
│  2. ACT         │ → Pythonコードで画像処理
└────────┬────────┘
         ▼
┌─────────────────┐
│  3. OBSERVE     │ → 結果を検証、必要に応じて再処理
└─────────────────┘
```

### 主な利点

- ✅ 視覚タスクで5-10%の精度向上
- ✅ 幻覚（Hallucination）の大幅削減
- ✅ ピクセル単位の正確な操作
- ✅ 自己修正能力

---

## ⚠️ 注意事項

- **API キー**: `.env` ファイルは `.gitignore` に追加してください
- **レート制限**: Gemini API のレート制限に注意
- **タイムアウト**: 複雑な処理は30秒のタイムアウトあり

---

## 📄 ライセンス

MIT License

---

## 🙏 謝辞

- [Google Gemini API](https://ai.google.dev/)
- [Vite](https://vitejs.dev/)
- [Express](https://expressjs.com/)
