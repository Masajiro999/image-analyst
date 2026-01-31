/**
 * startup-audio-analysis.js - 画像を見せて音声で感想を語るスクリプト
 * 
 * Gemini 2.5 Flash Native Audio を使用して、
 * デスクトップのスクリーンショットを解析し、音声で感想を述べます。
 * 音声はWAVファイルとして保存し、Windowsで再生します。
 */

import 'dotenv/config';
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
    model: 'gemini-2.5-flash-native-audio-preview-12-2025'
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

async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('  🎙️  画像を見て音声で感想を語るAI');
    console.log('═══════════════════════════════════════════════');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY が .env に設定されていません');
        process.exit(1);
    }

    // デスクトップキャプチャ
    const { buffer: imageBuffer, path: imagePath } = await captureDesktop();

    // 音声データを収集
    const audioChunks = [];

    console.log('🤖 Gemini Native Audio に接続中...');

    const ai = new GoogleGenAI({ apiKey });

    // 完了Promise
    const sessionComplete = new Promise(async (resolve, reject) => {
        try {
            const session = await ai.live.connect({
                model: CONFIG.model,
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: `あなたは画像を見て感想を述べるAIです。
日本語で自然に話してください。
画像に映っているものを観察し、興味深い点や気づいたことを
友達に話すように軽快に説明してください。30秒以内で簡潔に。`,
                },
                callbacks: {
                    onopen: () => {
                        console.log('✅ 接続完了！画像を送信中...');
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

            // セッション確立後に画像とプロンプトを送信
            console.log('📤 画像を送信中...');
            session.sendRealtimeInput({
                media: {
                    data: imageBuffer.toString('base64'),
                    mimeType: 'image/png',
                },
            });

            session.sendClientContent({
                turns: [{
                    role: 'user',
                    parts: [{ text: 'この画像を見て、感想を話してください。' }]
                }],
                turnComplete: true,
            });
        } catch (err) {
            reject(err);
        }
    });

    // セッション完了を待つ
    await sessionComplete;

    if (audioChunks.length > 0) {
        // WAVファイルとして保存
        const wavBuffer = createWavBuffer(audioChunks);
        const audioPath = imagePath.replace('.png', '_audio.wav');
        await fs.writeFile(audioPath, wavBuffer);
        console.log(`🎵 音声保存: ${audioPath}`);

        // Windows Media Playerで再生
        console.log('🔊 音声を再生中...');
        await execAsync(`powershell -Command "(New-Object Media.SoundPlayer '${audioPath}').PlaySync()"`, {
            encoding: 'utf-8'
        });
    } else {
        console.log('⚠️ 音声データが生成されませんでした');
    }

    console.log('═══════════════════════════════════════════════');
    console.log('🎉 完了！');
    process.exit(0);
}

main().catch((err) => {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
    process.exit(1);
});
