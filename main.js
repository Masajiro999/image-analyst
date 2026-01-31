/**
 * Gemini Agentic Vision - Frontend Application
 * ============================================
 * 画像をアップロードしてGemini 3 Flash Agentic Visionで分析
 */

// DOM要素
const elements = {
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    previewImage: document.getElementById('previewImage'),
    promptInput: document.getElementById('promptInput'),
    thinkingLevel: document.getElementById('thinkingLevel'),
    streamingToggle: document.getElementById('streamingToggle'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    copyResultBtn: document.getElementById('copyResultBtn'),

    // 結果表示
    resultContent: document.getElementById('resultContent'),
    processedImage: document.getElementById('processedImage'),
    codeContent: document.getElementById('codeContent'),
    rawContent: document.getElementById('rawContent'),

    // 進捗
    progressSection: document.getElementById('progressSection'),
    progressFill: document.getElementById('progressFill'),
    progressLog: document.getElementById('progressLog'),

    // モーダル
    settingsBtn: document.getElementById('settingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettings: document.getElementById('closeSettings'),
    saveSettings: document.getElementById('saveSettings'),
    apiKeyInput: document.getElementById('apiKeyInput'),

    // タブ
    tabs: document.querySelectorAll('.tab'),
    tabPanes: document.querySelectorAll('.tab-pane'),

    // クイックプロンプト
    quickPrompts: document.querySelectorAll('.quick-prompt')
};

// 状態管理
let state = {
    currentImage: null,
    currentImageBase64: null,
    isProcessing: false,
    lastResult: null
};

// ========================================
// 初期化
// ========================================

function init() {
    setupDropZone();
    setupTabNavigation();
    setupQuickPrompts();
    setupSettingsModal();
    setupAnalyzeButton();
    setupCopyButton();
}

// ========================================
// ドロップゾーン
// ========================================

function setupDropZone() {
    const { dropZone, fileInput, previewImage } = elements;

    // クリックでファイル選択
    dropZone.addEventListener('click', () => fileInput.click());

    // ファイル選択
    fileInput.addEventListener('change', (e) => {
        if (e.target.files?.[0]) {
            handleImageFile(e.target.files[0]);
        }
    });

    // ドラッグ&ドロップ
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');

        const file = e.dataTransfer.files?.[0];
        if (file?.type.startsWith('image/')) {
            handleImageFile(file);
        }
    });

    // ペースト対応
    document.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        for (const item of items || []) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) handleImageFile(file);
                break;
            }
        }
    });
}

function handleImageFile(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
        const base64 = e.target.result;
        state.currentImage = file;
        state.currentImageBase64 = base64;

        elements.previewImage.src = base64;
        elements.dropZone.classList.add('has-image');
        elements.analyzeBtn.disabled = false;
    };

    reader.readAsDataURL(file);
}

// ========================================
// タブナビゲーション
// ========================================

function setupTabNavigation() {
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.tab + 'Tab';

            // タブ状態更新
            elements.tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // パネル表示切替
            elements.tabPanes.forEach(pane => {
                pane.classList.toggle('active', pane.id === targetId);
            });
        });
    });
}

// ========================================
// クイックプロンプト
// ========================================

function setupQuickPrompts() {
    elements.quickPrompts.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.promptInput.value = btn.dataset.prompt;
            elements.promptInput.focus();
        });
    });
}

// ========================================
// 設定モーダル
// ========================================

function setupSettingsModal() {
    const { settingsBtn, settingsModal, closeSettings, saveSettings, apiKeyInput } = elements;

    settingsBtn.addEventListener('click', () => {
        settingsModal.showModal();
    });

    closeSettings.addEventListener('click', () => {
        settingsModal.close();
    });

    saveSettings.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem('gemini_api_key', apiKey);
        }
        settingsModal.close();
    });

    // 保存済みAPIキーを読み込み
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
    }
}

// ========================================
// 分析実行
// ========================================

function setupAnalyzeButton() {
    elements.analyzeBtn.addEventListener('click', analyzeImage);
}

async function analyzeImage() {
    if (!state.currentImageBase64) return;

    const prompt = elements.promptInput.value.trim() || 'この画像を分析してください';
    const streaming = elements.streamingToggle.checked;
    const thinkingLevel = elements.thinkingLevel.value;

    // UI状態更新
    state.isProcessing = true;
    elements.analyzeBtn.classList.add('loading');
    elements.analyzeBtn.disabled = true;
    elements.progressSection.hidden = false;
    elements.progressFill.style.width = '0%';
    elements.progressLog.innerHTML = '';

    // 結果エリアをクリア
    elements.resultContent.innerHTML = '<div class="placeholder"><span>⏳</span><p>分析中...</p></div>';

    try {
        if (streaming) {
            await analyzeWithStreaming(prompt, thinkingLevel);
        } else {
            await analyzeWithoutStreaming(prompt, thinkingLevel);
        }
    } catch (error) {
        console.error('Analysis error:', error);
        showError(error.message);
    } finally {
        state.isProcessing = false;
        elements.analyzeBtn.classList.remove('loading');
        elements.analyzeBtn.disabled = false;
        elements.progressFill.style.width = '100%';
    }
}

async function analyzeWithStreaming(prompt, thinkingLevel) {
    const response = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            imageBase64: state.currentImageBase64,
            prompt,
            thinkingLevel,
            streaming: true
        })
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let fullText = '';
    let codeBlocks = [];
    let progress = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
                const parsed = JSON.parse(data);

                if (parsed.chunk) {
                    fullText += parsed.chunk;
                    progress = Math.min(progress + 5, 90);
                    elements.progressFill.style.width = `${progress}%`;
                }

                if (parsed.code) {
                    codeBlocks.push(parsed.code);
                    addProgressLog(`🔧 Pythonコード実行中...`);
                }

                if (parsed.result) {
                    addProgressLog(`✅ 処理完了`);
                }
            } catch { }
        }
    }

    // 結果を表示
    processResult({ text: fullText, code: codeBlocks });
}

async function analyzeWithoutStreaming(prompt, thinkingLevel) {
    addProgressLog('🚀 分析リクエスト送信...');
    elements.progressFill.style.width = '30%';

    const response = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            imageBase64: state.currentImageBase64,
            prompt,
            thinkingLevel,
            streaming: false
        })
    });

    elements.progressFill.style.width = '60%';
    addProgressLog('📊 レスポンス受信...');

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `API Error: ${response.status}`);
    }

    const result = await response.json();
    elements.progressFill.style.width = '90%';

    processResult(result);
}

function processResult(result) {
    state.lastResult = result;
    elements.copyResultBtn.disabled = false;

    // 生データ表示
    elements.rawContent.querySelector('code').textContent = JSON.stringify(result, null, 2);

    // コード表示
    if (result.code?.length > 0) {
        elements.codeContent.querySelector('code').textContent = result.code.join('\n\n# ---\n\n');
    }

    // メイン結果表示
    const parsedData = result.parsedData || tryParseJson(result.text);

    if (parsedData) {
        displayParsedResult(parsedData);

        // 処理画像があれば表示
        if (parsedData.processed_image_base64 || parsedData.result_image_base64 || parsedData.annotated_base64) {
            const imageBase64 = parsedData.processed_image_base64 || parsedData.result_image_base64 || parsedData.annotated_base64;
            elements.processedImage.src = `data:image/png;base64,${imageBase64}`;
            elements.processedImage.classList.add('visible');
        }
    } else {
        elements.resultContent.innerHTML = `<div class="result-analysis"><p>${escapeHtml(result.text || 'No result')}</p></div>`;
    }
}

function displayParsedResult(data) {
    let html = '<div class="result-analysis">';

    if (data.analysis) {
        html += `<h3>📋 分析結果</h3><p>${escapeHtml(data.analysis)}</p>`;
    }

    if (data.summary) {
        html += `<h3>📝 要約</h3><p>${escapeHtml(data.summary)}</p>`;
    }

    if (data.metadata) {
        html += '<div class="result-metadata"><h4>🔍 メタデータ</h4>';

        if (data.metadata.detections?.length > 0) {
            html += '<ul class="detection-list">';
            for (const detection of data.metadata.detections) {
                html += `<li>${escapeHtml(JSON.stringify(detection))}</li>`;
            }
            html += '</ul>';
        }

        if (data.metadata.confidence !== undefined) {
            const confidence = data.metadata.confidence;
            const level = confidence >= 0.8 ? '' : confidence >= 0.5 ? 'low' : 'very-low';
            html += `<p>信頼度: <span class="confidence-badge ${level}">${(confidence * 100).toFixed(1)}%</span></p>`;
        }

        html += '</div>';
    }

    html += '</div>';
    elements.resultContent.innerHTML = html;
}

function tryParseJson(text) {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        // JSONブロックを抽出
        const match = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) {
            try {
                return JSON.parse(match[1]);
            } catch { }
        }
        return null;
    }
}

function showError(message) {
    elements.resultContent.innerHTML = `
    <div class="placeholder" style="color: var(--error);">
      <span>❌</span>
      <p>エラーが発生しました</p>
      <p style="font-size: 0.875rem; opacity: 0.8;">${escapeHtml(message)}</p>
    </div>
  `;
}

function addProgressLog(message) {
    const p = document.createElement('p');
    p.textContent = message;
    elements.progressLog.appendChild(p);
    elements.progressLog.scrollTop = elements.progressLog.scrollHeight;
}

// ========================================
// コピー機能
// ========================================

function setupCopyButton() {
    elements.copyResultBtn.addEventListener('click', () => {
        if (!state.lastResult) return;

        const text = JSON.stringify(state.lastResult, null, 2);
        navigator.clipboard.writeText(text).then(() => {
            elements.copyResultBtn.textContent = '✅ コピー完了';
            setTimeout(() => {
                elements.copyResultBtn.textContent = '📋 コピー';
            }, 2000);
        });
    });
}

// ========================================
// ユーティリティ
// ========================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// アプリケーション起動
// ========================================

document.addEventListener('DOMContentLoaded', init);
