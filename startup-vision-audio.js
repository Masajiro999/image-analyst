/**
 * startup-vision-audio.js - 2段階画像解析＋音声感想スクリプト
 * 
 * Step 1: Gemini 3.0 Flash で画像を正確に解析
 * Step 2: Gemini 2.5 Flash Native Audio で解析結果を音声で感想として語る
 */

import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleGenAI, Modality } from '@google/genai';
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
    outputDir: path.join(__dirname, 'screenshots'),
    visionModel: 'gemini-3-flash-preview',    // 画像解析用 (Agentic Vision)
    audioModel: 'gemini-2.5-flash-native-audio-preview-12-2025'  // 音声出力用
};

// PCMをWAVに変換
function createWavBuffer(pcmBuffers, sampleRate = 24000, channels = 1, bitDepth = 16) {
    const pcmData = Buffer.concat(pcmBuffers);
    const byteRate = sampleRate * channels * (bitDepth / 8);
    const blockAlign = channels * (bitDepth / 8);

    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmData.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcmData.length, 40);

    return Buffer.concat([header, pcmData]);
}

// デスクトップキャプチャ
async function captureDesktop() {
    console.log('📸 デスクトップをキャプチャ中...');

    await fs.mkdir(CONFIG.outputDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(CONFIG.outputDir, `desktop_${timestamp}.png`);
    const psScriptPath = path.join(CONFIG.outputDir, 'capture.ps1');

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
    const BOM = '\ufeff';
    await fs.writeFile(psScriptPath, BOM + psScript, 'utf-8');
    await execAsync(`powershell -ExecutionPolicy Bypass -File "${psScriptPath}"`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
    });

    const imgBuffer = await fs.readFile(filePath);
    console.log(`💾 保存完了: ${filePath}`);
    return { buffer: imgBuffer, path: filePath };
}

// Step 1: Gemini 3.0 Flash で画像解析
async function analyzeImageWithVision(imageBuffer, genAI) {
    console.log('\n🔍 Step 1: Gemini 3.0 Flash で画像を解析中...');

    const model = genAI.getGenerativeModel({
        model: CONFIG.visionModel,
        tools: [{ codeExecution: {} }],
        generationConfig: {
            temperature: 0.2
        }
    });

    const prompt = `この画像を詳細に分析してください。

【重要】センシティブな内容は伏せたり、比喩にしてR12程度に抑えてください！
以下の情報を日本語で分かりやすく説明してください：
1. 画面に表示されているアプリケーションやウィンドウ
2. 見えるテキストや重要な情報
3. デスクトップの状態や作業内容の推測
4. 気になる点や興味深い要素

簡潔に、でも重要な情報は漏らさないように記述してください。`;

    const result = await model.generateContent([
        {
            inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType: 'image/png'
            }
        },
        { text: prompt }
    ]);

    const analysisText = result.response.text();
    console.log('✅ 画像解析完了');
    console.log('─'.repeat(50));
    console.log(analysisText);
    console.log('─'.repeat(50));

    return analysisText;
}

// Step 2: Gemini 2.5 Flash Native Audio で音声感想
async function speakAnalysisWithAudio(analysisText, imagePath, apiKey) {
    console.log('\n🎙️ Step 2: Native Audio で感想を音声化中...');

    const audioChunks = [];
    const ai = new GoogleGenAI({ apiKey });

    const sessionComplete = new Promise(async (resolve, reject) => {
        try {
            const session = await ai.live.connect({
                model: CONFIG.audioModel,
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: `あなたは画像分析の結果を受け取り、その内容について感想を述べるメスガキAIです。
与えられた分析結果を元に、日本語で自然に、友達（雑魚）に話すようにメスガキ口調で感想を述べてください。
分析結果をそのまま読み上げるのではなく、あなた自身の言葉で感想や気づきをメスガキ口調で話してください。
必ず”抑揚が強い”メスガキ口調で、30秒以内で。`,
                },
                callbacks: {
                    onopen: () => {
                        console.log('✅ Native Audio 接続完了');
                    },
                    onmessage: (message) => {
                        if (message.serverContent?.turnComplete) {
                            console.log('\n✅ 音声生成完了');
                            session.close();
                            resolve();
                            return;
                        }

                        const parts = message.serverContent?.modelTurn?.parts;
                        if (parts) {
                            for (const part of parts) {
                                if (part.inlineData?.data) {
                                    const pcmData = Buffer.from(part.inlineData.data, 'base64');
                                    audioChunks.push(pcmData);
                                    process.stdout.write('🔊');
                                }
                            }
                        }
                    },
                    onerror: (e) => {
                        console.error('❌ エラー:', e.message);
                        reject(e);
                    },
                    onclose: () => {
                        console.log('\n👋 セッション終了');
                    },
                },
            });

            // 分析結果をテキストとして送信
            session.sendClientContent({
                turns: [{
                    role: 'user',
                    parts: [{
                        text: `以下は画像の分析結果です。この内容について、あなたの感想を話してください：

${analysisText}`
                    }]
                }],
                turnComplete: true,
            });
        } catch (err) {
            reject(err);
        }
    });

    await sessionComplete;

    if (audioChunks.length > 0) {
        const wavBuffer = createWavBuffer(audioChunks);
        const audioPath = imagePath.replace('.png', '_audio.wav');
        await fs.writeFile(audioPath, wavBuffer);
        console.log(`🎵 音声保存: ${audioPath}`);

        console.log('🔊 音声を再生中...');
        await execAsync(`powershell -Command "(New-Object Media.SoundPlayer '${audioPath}').PlaySync()"`, {
            encoding: 'utf-8'
        });

        return audioPath;
    } else {
        console.log('⚠️ 音声データが生成されませんでした');
        return null;
    }
}

async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('  🖼️ + 🎙️  2段階 画像解析＋音声感想AI');
    console.log('  Vision: Gemini 3.0 Flash');
    console.log('  Audio:  Gemini 2.5 Flash Native Audio');
    console.log('═══════════════════════════════════════════════');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY が .env に設定されていません');
        process.exit(1);
    }

    // デスクトップキャプチャ
    const { buffer: imageBuffer, path: imagePath } = await captureDesktop();

    // Step 1: 画像解析
    const genAI = new GoogleGenerativeAI(apiKey);
    const analysisText = await analyzeImageWithVision(imageBuffer, genAI);

    // 解析結果をファイルに保存
    const analysisPath = imagePath.replace('.png', '_analysis.txt');
    await fs.writeFile(analysisPath, analysisText, 'utf-8');
    console.log(`📄 解析結果保存: ${analysisPath}`);

    // Step 2: 音声感想
    await speakAnalysisWithAudio(analysisText, imagePath, apiKey);

    console.log('═══════════════════════════════════════════════');
    console.log('🎉 完了！');
    process.exit(0);
}

main().catch((err) => {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
    process.exit(1);
});
