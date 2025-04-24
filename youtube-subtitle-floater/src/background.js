/**
 * YouTube字幕浮窗插件的背景脚本
 * 处理浏览器事件并与内容脚本通信
 */

import TranslationService from './translation-service.js';

// 日志前缀，用于搜索
const LOG_PREFIX = '[YT-SUB-DEBUG]';

// 创建翻译服务实例（延迟初始化）
let translationService = null;

// 添加日志函数
function logDebug(message, data = null) {
  const logMessage = `${LOG_PREFIX} ${message}`;
  if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
}

// 获取或初始化翻译服务
async function getTranslationService() {
  if (translationService) {
    return translationService;
  }
  
  // 从存储中获取API密钥和选择的模型
  return new Promise(resolve => {
    chrome.storage.sync.get(['apiKey', 'selectedModel'], function(data) {
      const apiKey = data.apiKey || '';
      const selectedModel = data.selectedModel || '';
      logDebug('获取API密钥和模型', { 
        apiKey: apiKey ? apiKey.substring(0, 5) + '...' : '未设置',
        selectedModel: selectedModel || '未设置'
      });
      translationService = new TranslationService(apiKey);
      
      // 如果有选择的模型，设置它
      if (selectedModel) {
        // 注意：这里不直接设置模型，而是在获取可用模型列表后再设置
        // 因为需要先获取可用模型列表才能验证选择的模型是否有效
        translationService.updateAvailableModels()
          .then(() => {
            try {
              translationService.setModel(selectedModel);
              logDebug('设置选择的模型', { model: selectedModel });
            } catch (error) {
              logDebug('设置选择的模型失败', { error: error.message });
            }
            resolve(translationService);
          })
          .catch(error => {
            logDebug('获取可用模型列表失败', { error: error.message });
            resolve(translationService);
          });
      } else {
        resolve(translationService);
      }
    });
  });
}

// 监听存储变化，更新API密钥和选择的模型
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    if (changes.apiKey) {
      const newApiKey = changes.apiKey.newValue || '';
      logDebug('API密钥已更新', { apiKey: newApiKey ? newApiKey.substring(0, 5) + '...' : '未设置' });
      
      // 如果翻译服务已初始化，则更新API密钥
      if (translationService) {
        translationService.updateApiKey(newApiKey);
      }
    }
    
    if (changes.selectedModel) {
      const newModel = changes.selectedModel.newValue || '';
      logDebug('选择的模型已更新', { model: newModel });
      
      // 如果翻译服务已初始化，则更新选择的模型
      if (translationService && newModel) {
        try {
          translationService.setModel(newModel);
          logDebug('更新选择的模型成功', { model: newModel });
        } catch (error) {
          logDebug('更新选择的模型失败', { error: error.message });
        }
      }
    }
  }
});

// 监听标签页更新，检测YouTube页面加载
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
    logDebug('YouTube页面完成加载', { tabId, url: tab.url });
    // 检查插件是否启用
    chrome.storage.sync.get(['isEnabled'], function(data) {
      logDebug('插件启用状态', data);
      if (data.isEnabled) {
        // 向内容脚本发送初始化消息
        chrome.tabs.sendMessage(tabId, { action: 'initializeFloater' }, (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            logDebug('发送初始化消息失败', { error: lastError.message });
            // 如果内容脚本尚未加载，尝试延迟发送
            setTimeout(() => {
              logDebug('延迟发送初始化消息');
              chrome.tabs.sendMessage(tabId, { action: 'initializeFloater' });
            }, 2000);
          } else {
            logDebug('初始化消息发送成功', response);
          }
        });
      }
    });
  }
});

// 监听内容脚本发来的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logDebug('收到消息', message);
  
  // 处理获取字幕请求
  if (message.action === 'getTranscript') {
    logDebug('开始获取字幕', { videoId: message.videoId, language: message.language });
    
    // 添加重试机制
    const fetchWithRetry = async (retries = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          const transcript = await fetchTranscript(message.videoId, message.language);
          logDebug('成功获取字幕', { count: transcript.length, attempt: i + 1 });
          return transcript;
        } catch (error) {
          logDebug('获取字幕失败', { error: error.message, attempt: i + 1, remainingRetries: retries - i - 1 });
          if (i === retries - 1) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // 递增重试延迟
        }
      }
    };
    
    // 执行带重试的字幕获取
    fetchWithRetry()
      .then(transcript => {
        sendResponse({ success: true, transcript: transcript });
      })
      .catch(error => {
        logDebug('所有重试都失败', { error: error.message, stack: error.stack });
        sendResponse({ success: false, error: error.message });
      });
    
    // 返回true表示将异步发送响应
    return true;
  }
  
  // 处理翻译字幕请求
  if (message.action === 'translateSubtitle') {
    logDebug('开始翻译字幕', { 
      text: message.text,
      targetLanguage: message.targetLanguage,
      translationRatio: message.translationRatio,
      modelId: message.modelId || '使用默认模型'
    });
    
    // 调用翻译服务
    getTranslationService().then(service => {
      // 如果消息中提供了API密钥，且与当前不同，则更新服务实例
      if (message.apiKey && message.apiKey !== service.apiKey) {
        logDebug('更新API密钥', { 
          oldKey: (service.apiKey || '').substring(0, 5) + '...', 
          newKey: message.apiKey.substring(0, 5) + '...' 
        });
        service.apiKey = message.apiKey;
      }
      
      return service.translateSubtitle(message.text, {
        targetLanguage: message.targetLanguage,
        translationRatio: message.translationRatio,
        modelId: message.modelId // 传递模型ID
      });
    })
      .then(translatedText => {
        logDebug('翻译成功', { original: message.text, translated: translatedText });
        sendResponse({ success: true, translatedText: translatedText });
      })
      .catch(error => {
        logDebug('翻译失败', { error: error.message, stack: error.stack });
        sendResponse({ success: false, error: error.message });
      });
    
    // 返回true表示将异步发送响应
    return true;
  }
  
  // 处理其他消息类型
  sendResponse({ received: true });
  return true;
});

/**
 * 获取YouTube视频字幕
 * @param {string} videoId - YouTube视频ID
 * @param {string} lang - 字幕语言代码
 * @returns {Promise<Array>} - 字幕数据数组
 */
async function fetchTranscript(videoId, lang = 'en') {
  try {
    // 构建获取字幕信息的URL
    const videoInfoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    logDebug('构建视频URL', videoInfoUrl);
    
    // 第一步：获取视频页面HTML
    logDebug('开始获取视频页面HTML');
    let response;
    try {
      response = await fetch(videoInfoUrl);
      logDebug('获取视频页面响应状态', { status: response.status, ok: response.ok });
      if (!response.ok) {
        throw new Error(`HTTP错误 ${response.status}: ${response.statusText}`);
      }
    } catch (fetchError) {
      logDebug('获取视频页面失败', { error: fetchError.message });
      throw new Error(`获取视频页面失败: ${fetchError.message}`);
    }
    
    let html;
    try {
      html = await response.text();
      logDebug('成功获取HTML', { length: html.length });
      // 记录HTML前1000个字符用于调试
      logDebug('HTML预览', html.substring(0, 1000));
    } catch (textError) {
      logDebug('解析响应内容失败', { error: textError.message });
      throw new Error(`解析响应内容失败: ${textError.message}`);
    }
    
    // 提取字幕轨道信息
    const captionRegex = /"captionTracks":\[(.*?)\]/s;
    logDebug('使用正则表达式搜索字幕信息');
    const match = html.match(captionRegex);
    
    if (!match || !match[1]) {
      // 尝试其他可能的模式
      const altRegex = /"playerCaptionsTracklistRenderer":.+?"captionTracks":\[(.*?)\]/s;
      const altMatch = html.match(altRegex);
      
      if (!altMatch || !altMatch[1]) {
        logDebug('未找到字幕信息 - 正则表达式匹配失败');
        // 记录HTML中是否包含关键词
        logDebug('HTML包含字幕关键词检查', {
          hasCaptionTracks: html.includes('"captionTracks"'),
          hasPlayerCaptions: html.includes('"playerCaptionsTracklistRenderer"')
        });
        throw new Error('无法找到字幕信息，视频可能没有字幕或YouTube界面已更新');
      }
      
      logDebug('使用替代正则表达式找到字幕信息');
      match[1] = altMatch[1];
    } else {
      logDebug('成功找到字幕信息');
    }
    
    // 解析字幕轨道信息
    logDebug('解析字幕轨道JSON');
    const captionTracksJson = `[${match[1]}]`;
    logDebug('字幕轨道JSON', captionTracksJson);
    
    let captionTracks;
    try {
      captionTracks = JSON.parse(captionTracksJson);
      logDebug('成功解析字幕轨道', { tracks: captionTracks.length });
    } catch (jsonError) {
      logDebug('解析字幕轨道JSON失败', { error: jsonError.message, json: captionTracksJson });
      throw new Error(`解析字幕轨道信息失败: ${jsonError.message}`);
    }
    
    // 记录所有可用的字幕语言
    const availableLanguages = captionTracks.map(track => ({
      code: track.languageCode,
      name: track.name?.simpleText || track.name,
      isAuto: track.kind === 'asr'
    }));
    logDebug('可用字幕语言', availableLanguages);
    
    // 查找指定语言的字幕
    logDebug('查找指定语言字幕', { requested: lang });
    let targetTrack = captionTracks.find(track => track.languageCode === lang);
    
    // 如果找不到指定语言，使用默认字幕
    if (!targetTrack && captionTracks.length > 0) {
      logDebug('未找到指定语言，使用默认字幕', { default: captionTracks[0].languageCode });
      targetTrack = captionTracks[0];
    }
    
    if (!targetTrack || !targetTrack.baseUrl) {
      logDebug('未找到有效的字幕轨道', { targetTrack });
      throw new Error(`未找到${lang}语言的字幕，可能此视频没有所选语言的字幕`);
    }
    
    // 获取字幕内容
    logDebug('获取字幕内容', { url: targetTrack.baseUrl });
    let transcriptResponse;
    try {
      transcriptResponse = await fetch(targetTrack.baseUrl);
      logDebug('字幕内容响应状态', { status: transcriptResponse.status, ok: transcriptResponse.ok });
      if (!transcriptResponse.ok) {
        throw new Error(`HTTP错误 ${transcriptResponse.status}: ${transcriptResponse.statusText}`);
      }
    } catch (fetchError) {
      logDebug('获取字幕内容失败', { error: fetchError.message });
      throw new Error(`获取字幕内容失败: ${fetchError.message}`);
    }
    
    let transcriptXml;
    try {
      transcriptXml = await transcriptResponse.text();
      logDebug('成功获取XML字幕', { length: transcriptXml.length });
      // 记录XML前500个字符用于调试
      logDebug('XML预览', transcriptXml.substring(0, 500));
    } catch (textError) {
      logDebug('解析字幕XML失败', { error: textError.message });
      throw new Error(`解析字幕XML失败: ${textError.message}`);
    }
    
    // 解析XML格式的字幕
    logDebug('解析XML字幕');
    // 不能在Service Worker中使用DOMParser，改用正则表达式解析XML
    try {
      // 使用正则表达式提取文本元素
      const textRegex = /<text\s+start="([\d\.]+)"\s+dur="([\d\.]+)"(?:[^>]*)>(.*?)<\/text>/gi;
      const transcript = [];
      let match;
      
      logDebug('使用正则表达式解析XML字幕');
      while ((match = textRegex.exec(transcriptXml)) !== null) {
        const start = parseFloat(match[1]);
        const duration = parseFloat(match[2]);
        // 解码HTML实体
        const text = match[3]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        
        transcript.push({
          start,
          end: start + duration,
          text
        });
      }
      
      logDebug('成功处理字幕数据', { entries: transcript.length });
      
      if (transcript.length === 0) {
        logDebug('未找到字幕文本元素');
        throw new Error('字幕格式异常：未找到文本元素');
      }
      
      // 返回字幕数组
      return transcript;
    } catch (formatError) {
      logDebug('处理字幕数据失败', { error: formatError.message });
      throw new Error(`处理字幕数据失败: ${formatError.message}`);
    }
  } catch (error) {
    logDebug('获取字幕过程中出错', { error: error.message, stack: error.stack });
    throw error;
  }
}