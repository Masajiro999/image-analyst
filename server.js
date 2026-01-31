import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

// Gemini API初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 静的ファイル配信
app.use(express.static(join(__dirname, 'dist')));
app.use(express.json({ limit: '50mb' }));

// Agentic Vision API エンドポイント
app.post('/api/vision', upload.single('image'), async (req, res) => {
    try {
        const { prompt, thinkingLevel = 'medium', streaming = false } = req.body;

        // 画像データ取得（アップロードまたはBase64）
        let imageBase64;
        let mimeType = 'image/png';

        if (req.file) {
            imageBase64 = req.file.buffer.toString('base64');
            mimeType = req.file.mimetype;
        } else if (req.body.imageBase64) {
            // Base64データからデータURLプレフィックスを除去
            const base64Data = req.body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
            imageBase64 = base64Data;
            const match = req.body.imageBase64.match(/^data:(image\/\w+);base64,/);
            if (match) mimeType = match[1];
        } else {
            return res.status(400).json({ error: '画像が提供されていません' });
        }

        // Gemini モデル設定（Agentic Vision有効化）
        const model = genAI.getGenerativeModel({
            model: 'gemini-3-flash-preview',
            tools: [{ codeExecution: {} }],
            generationConfig: {
                temperature: 0.2
            }
        });

        // プロンプト構築
        const enhancedPrompt = buildAgenticPrompt(prompt);

        const userMessage = [
            {
                inlineData: {
                    data: imageBase64,
                    mimeType: mimeType
                }
            },
            { text: enhancedPrompt }
        ];

        // ストリーミングまたは通常レスポンス
        if (streaming === 'true' || streaming === true) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const stream = await model.generateContentStream(userMessage);

            for await (const chunk of stream.stream) {
                const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (text) {
                    res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
                }

                // コード実行結果もストリーム
                const parts = chunk.candidates?.[0]?.content?.parts || [];
                for (const part of parts) {
                    if (part.executableCode) {
                        res.write(`data: ${JSON.stringify({ code: part.executableCode.code })}\n\n`);
                    }
                    if (part.codeExecutionResult) {
                        res.write(`data: ${JSON.stringify({ result: part.codeExecutionResult.output })}\n\n`);
                    }
                }
            }

            res.write('data: [DONE]\n\n');
            res.end();
        } else {
            const chat = model.startChat();
            const result = await chat.sendMessage(userMessage);

            // レスポンス解析
            const response = parseAgenticResponse(result);
            res.json(response);
        }
    } catch (error) {
        console.error('Vision API Error:', error);
        res.status(500).json({
            error: error.message,
            details: error.stack
        });
    }
});

// Agentic Vision用プロンプト構築
function buildAgenticPrompt(userPrompt) {
    return `
あなたはAgentic Visionモードで画像を分析します。
Think-Act-Observeループを使用して、正確な結果を提供してください。

[ユーザーリクエスト]
${userPrompt}

[処理指示]
THINK:
1. 画像の内容を分析
2. ユーザーリクエストに必要な処理を計画
3. 使用するアルゴリズムを決定

ACT:
Pythonコードを使用して画像処理を実行してください。
必要に応じて: cv2, numpy, PIL, matplotlib を使用できます。

OBSERVE:
処理結果を確認し、必要に応じて調整してください。

[出力形式]
以下のJSON形式で返してください:
{
  "analysis": "画像分析の説明",
  "processed_image_base64": "処理後の画像（Base64、ある場合）",
  "metadata": {
    "detections": [],
    "measurements": {},
    "confidence": 0.0
  },
  "summary": "処理結果の要約"
}
`.trim();
}

// レスポンス解析
function parseAgenticResponse(result) {
    const response = {
        success: true,
        text: '',
        code: [],
        codeResults: [],
        parsedData: null
    };

    try {
        const candidates = result.response.candidates || [];

        for (const candidate of candidates) {
            const parts = candidate.content?.parts || [];

            for (const part of parts) {
                if (part.text) {
                    response.text += part.text;
                }
                if (part.executableCode) {
                    response.code.push(part.executableCode.code);
                }
                if (part.codeExecutionResult) {
                    response.codeResults.push(part.codeExecutionResult.output);
                }
            }
        }

        // JSONパース試行
        try {
            response.parsedData = JSON.parse(response.text);
        } catch {
            // JSONでない場合はテキストのまま
        }
    } catch (error) {
        response.success = false;
        response.error = error.message;
    }

    return response;
}

// 開発時はフロントエンドをViteから配信
if (process.env.NODE_ENV !== 'production') {
    app.get('*', (req, res) => {
        res.redirect('http://localhost:5173');
    });
}

app.listen(PORT, () => {
    console.log(`🚀 Agentic Vision Server running at http://localhost:${PORT}`);
    console.log(`📡 API Endpoint: http://localhost:${PORT}/api/vision`);
});
