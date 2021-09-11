// タブごとに音声モジュールを保持するオブジェクト
const data = {};

// 音声モジュールを作成する
const createAudio = async (id) => {
    const stream = await new Promise((resolve) => {
        chrome.tabCapture.capture(
            { audio: true, video: false },
            (stream) => resolve(chrome.runtime.lastError ? null : stream)
        );
    });
    if (stream === null) return false;
    const audio = {};
    audio.context = new window.AudioContext;
    audio.stream = stream;
    audio.streamOutput = audio.context.createMediaStreamSource(audio.stream);
    audio.gainNode = audio.context.createGain();
    audio.streamOutput.connect(audio.gainNode);
    audio.gainNode.connect(audio.context.destination);
    audio.muted = false;
    audio.volume = 0;
    audio.gainNode.gain.value = 0;
    data[id] = audio;
    return true;
};

// 音声モジュールを削除する
const deleteAudio = (id) => {
    if (id in data === false) return;
    const audio = data[id];
    audio.stream.getTracks().forEach(track => track.stop());
    audio.context.close();
    delete data[id];
};

// 停止中の音声モジュールを全て削除する
const deleteInactiveAudio = () => {
    for (const [id, audio] of Object.entries(data)) {
        if (audio.stream.active) continue;
        deleteAudio(id);
    }
};

// 音量を設定する
const setGainValue = (audio) => {
    audio.gainNode.gain.value = audio.muted ? 0 : audio.volume / 100;
};

// コマンドを制御する
const handleCommand = async (command) => {
    // 該当タブの情報を取得する
    const tab = await new Promise((resolve) => {
        chrome.tabs.query(
            { currentWindow: true, active: true },
            (tabs) => resolve(tabs[0])
        );
    });
    // 該当タブの音声モジュールが存在しない場合
    if (tab.id in data === false) {
        // 音声モジュールを作成する
        const status = await createAudio(tab.id);
        if (status === false) return;
        // ミュートを解除する
        chrome.tabs.update(tab.id, { muted: false });
    }
    // 該当タブの音声モジュールを取得する
    const audio = data[tab.id];
    // ミュートコマンドの場合 -> ミュートの状態を切り替える
    if (command === 'volume-mute') {
        audio.muted = !audio.muted;
        setGainValue(audio);
        chrome.browserAction.setIcon({
            path: audio.muted ? 'icons/mute16.png' : 'icons/icon16.png',
            tabId: tab.id
        });
    }
    // 音量調整コマンドの場合
    if (command === 'volume-up' || command === 'volume-down') {
        // 音量アップの場合 -> 音量を5%上げる
        if (command === 'volume-up') {
            audio.volume = Math.min(100, audio.volume + 5);
        }
        // 音量ダウンの場合 -> 音量を5%下げる
        if (command === 'volume-down') {
            audio.volume = Math.max(0, audio.volume - 5);
        }
        // 音量を設定する
        setGainValue(audio);
        // アイコンに音量を表示する
        chrome.browserAction.setBadgeText({
            tabId: tab.id,
            text: audio.volume.toString()
        });
    }
};

// タブ生成イベント -> ミュートに設定する
chrome.tabs.onCreated.addListener((tab) => {
    chrome.tabs.update(tab.id, { muted: true });
});

// タブ削除イベント -> 停止中の音声モジュールを削除する
chrome.tabs.onRemoved.addListener((tabId) => {
    deleteAudio(tabId);
    deleteInactiveAudio();
});

// タブ更新イベント -> アイコンに音量を表示する
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status && tabId in data) {
        chrome.browserAction.setBadgeText({
            tabId: tabId,
            text: data[tabId].volume.toString()
        });
    }
});

// コマンドイベント -> コマンドを制御する
chrome.commands.onCommand.addListener((command) => {
    handleCommand(command);
});

// アイコンクリックイベント -> ミュートの状態を切り替える
chrome.browserAction.onClicked.addListener((tab) => {
    handleCommand('volume-mute');
});

// コンテキストメニュー
chrome.contextMenus.create({
    type: 'normal',
    id: 'RESET_AUDIO',
    title: 'リセット',
    contexts: ['browser_action']
}, () => chrome.runtime.lastError);

// クリックイベント: コンテキストメニュー
chrome.contextMenus.onClicked.addListener((info, tab) => {
    // 該当タブの音声をリセットする
    if (info.menuItemId === 'RESET_AUDIO') {
        deleteAudio(tab.id);
        chrome.tabs.update(tab.id, { muted: false });
        chrome.browserAction.setBadgeText({ tabId: tab.id, text: '' });
        chrome.browserAction.setIcon({ path: 'icons/icon16.png', tabId: tab.id });
    }
});
