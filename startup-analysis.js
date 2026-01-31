/**
 * startup-analysis.js - 起動時デスクトップ解析スクリプト
 * 
 * デスクトップのスクリーンショットを取得し、Gemini Agentic Vision で解析します。
 * PowerShellから直接実行可能: node startup-analysis.js
 */

import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 設定
const CONFIG = {
    delayMs: 5000, // 起動後の待機時間（ミリ秒）
    outputDir: path.join(__dirname, 'screenshots'),
    thinkingLevel: 'medium'
};

// Gemini API 初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function captureDesktop() {
    console.log('📸 デスクトップをキャプチャ中...');

    // スクリーンショット保存先
    await fs.mkdir(CONFIG.outputDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(CONFIG.outputDir, `desktop_${timestamp}.png`);
    const psScriptPath = path.join(CONFIG.outputDir, 'capture.ps1');

    // PowerShellスクリプトを一時ファイルに書き出す
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
$bitmap.Save("${filePath}", [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
`;
    // BOM付きUTF-8で保存（日本語パス対応）
    const BOM = '\ufeff';
    await fs.writeFile(psScriptPath, BOM + psScript, 'utf-8');

    // PowerShellスクリプト実行
    await execAsync(`powershell -ExecutionPolicy Bypass -File "${psScriptPath}"`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
    });

    const imgBuffer = await fs.readFile(filePath);
    console.log(`💾 保存完了: ${filePath}`);

    return { buffer: imgBuffer, path: filePath };
}

async function analyzeWithGemini(imageBuffer) {
    console.log('🤖 Gemini Agentic Vision で解析中...');

    const model = genAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
        tools: [{ codeExecution: {} }],
        generationConfig: {
            temperature: 0.2
        }
    });

    const prompt = `
あなたはAgentic Visionモードでデスクトップのスクリーンショットを分析します。

[タスク]
現在のデスクトップの状態を分析し、以下の情報を抽出してください:

THINK:
1. 開いているウィンドウやアプリケーション
2. 表示されている通知やアラート
3. デスクトップの全体的な状態

ACT:
必要に応じてPythonで画像処理を行い、詳細を確認してください。

OBSERVE:
処理結果を確認し、要約を作成してください。

[出力形式]
以下の情報を日本語で簡潔にまとめてください:
- 開いているアプリケーション一覧
- 通知やアラートの有無
- 作業状態の要約（何をしていたか推測）
`;

    try {
        const result = await model.generateContent([
            {
                inlineData: {
                    data: imageBuffer.toString('base64'),
                    mimeType: 'image/png'
                }
            },
            { text: prompt }
        ]);

        return result.response.text();
    } catch (error) {
        console.error('API Error:', error.message);
        throw error;
    }
}

async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('  🖥️  デスクトップ起動時解析システム');
    console.log('═══════════════════════════════════════════════');

    // APIキー確認
    if (!process.env.GEMINI_API_KEY) {
        console.error('❌ GEMINI_API_KEY が .env に設定されていません');
        process.exit(1);
    }

    // 初回起動時は少し待機（オプション）
    if (process.argv.includes('--wait')) {
        console.log(`⏳ ${CONFIG.delayMs / 1000}秒待機中...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.delayMs));
    }

    try {
        // デスクトップキャプチャ
        const { buffer, path: imagePath } = await captureDesktop();

        // Gemini解析
        const analysis = await analyzeWithGemini(buffer);

        console.log('\n═══════════════════════════════════════════════');
        console.log('  📊 解析結果');
        console.log('═══════════════════════════════════════════════');
        console.log(analysis);
        console.log('═══════════════════════════════════════════════\n');

        // 解析結果をファイルに保存
        const resultPath = imagePath.replace('.png', '_analysis.txt');
        await fs.writeFile(resultPath, analysis, 'utf-8');
        console.log(`📄 解析結果保存: ${resultPath}`);

    } catch (error) {
        console.error('❌ エラー:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main();
