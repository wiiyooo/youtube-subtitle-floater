/**
 * YouTube字幕浮窗插件的内容脚本
 * 负责创建可拖动浮窗、获取字幕并显示
 */

// 日志前缀，与背景脚本一致，用于搜索
const LOG_PREFIX = '[YT-SUB-DEBUG]';

// 添加日志函数
function logDebug(message, data = null) {
  const logMessage = `${LOG_PREFIX} [Content] ${message}`;
  if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
}

class YouTubeSubtitleFloater {
  /**
   * 初始化字幕浮窗
   */
  constructor() {
    this.floaterElement = null;
    this.contentElement = null;
    this.headerElement = null;
    this.isDragging = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.isMinimized = false;
    this.videoId = this.getVideoId();
    this.currentTime = 0;
    this.transcript = [];
    this.currentSubtitleIndex = -1;
    this.settings = {
      language: 'en',
      fontSize: 16,
      opacity: 0.8,
      translationEnabled: false,
      translationLanguage: 'zh',
      translationRatio: 1.0,
      apiKey: '',
      selectedModel: ''
    };
    
    // 翻译缓存，避免重复翻译
    this.translationCache = {};
    
    logDebug('YouTubeSubtitleFloater实例已创建', { videoId: this.videoId });
    
    // 监听消息
    this.setupMessageListener();
  }
  
  /**
   * 从当前URL获取YouTube视频ID
   * @returns {string|null} 视频ID或null
   */
  getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    logDebug('从URL获取视频ID', { url: window.location.href, videoId });
    return videoId;
  }
  
  /**
   * 设置消息监听器
   */
  setupMessageListener() {
    logDebug('设置消息监听器');
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      logDebug('收到消息', message);
      switch (message.action) {
        case 'initializeFloater':
          logDebug('收到初始化浮窗消息');
          this.initialize();
          break;
        case 'showFloater':
          logDebug('收到显示浮窗消息');
          this.show();
          break;
        case 'hideFloater':
          logDebug('收到隐藏浮窗消息');
          this.hide();
          break;
        case 'updateSettings':
          logDebug('收到更新设置消息', message.settings);
          this.updateSettings(message.settings);
          break;
        case 'retryTranslation':
          logDebug('收到重试翻译消息', { model: message.model });
          if (this.settings.translationEnabled && this.currentSubtitleIndex >= 0) {
            logDebug('开始重试翻译当前字幕', { model: message.model });
            this.translateCurrentSubtitle()
              .then(() => logDebug('重试翻译成功', { model: message.model }))
              .catch(error => logDebug('重试翻译失败', { model: message.model, error: error.message }));
          }
          break;
      }
      // 确保消息响应
      sendResponse({ received: true });
      return true; // 保持消息通道开放
    });
  }
  
  /**
   * 初始化浮窗
   */
  async initialize() {
    logDebug('开始初始化浮窗');
    // 如果已存在浮窗，则先移除
    if (this.floaterElement) {
      logDebug('移除现有浮窗');
      document.body.removeChild(this.floaterElement);
    }
    
    // 创建浮窗元素
    logDebug('创建浮窗元素');
    this.createFloaterElement();
    
    // 加载已保存的设置
    logDebug('加载设置');
    await this.loadSettings();
    
    // 获取字幕
    logDebug('获取字幕');
    await this.fetchTranscript();
    
    // 设置视频时间更新监听
    logDebug('设置视频时间监听');
    this.setupVideoTimeListener();
    
    // 显示浮窗
    logDebug('显示浮窗');
    this.show();
  }
  
  /**
   * 创建浮窗DOM元素
   */
  createFloaterElement() {
    logDebug('创建浮窗DOM元素');
    try {
      // 创建主容器
      this.floaterElement = document.createElement('div');
      this.floaterElement.className = 'yt-subtitle-floater';
      
      // 创建标题栏
      this.headerElement = document.createElement('div');
      this.headerElement.className = 'yt-subtitle-header';
      
      // 标题
      const titleElement = document.createElement('div');
      titleElement.className = 'yt-subtitle-title';
      titleElement.textContent = '字幕浮窗';
      this.headerElement.appendChild(titleElement);
      
      // 控制按钮
      const controlsElement = document.createElement('div');
      controlsElement.className = 'yt-subtitle-controls';
      
      // 最小化按钮
      const minimizeButton = document.createElement('button');
      minimizeButton.innerHTML = '－';
      minimizeButton.title = '最小化';
      minimizeButton.addEventListener('click', () => this.toggleMinimize());
      
      // 关闭按钮
      const closeButton = document.createElement('button');
      closeButton.innerHTML = '✕';
      closeButton.title = '关闭';
      closeButton.addEventListener('click', () => this.hide());
      
      controlsElement.appendChild(minimizeButton);
      controlsElement.appendChild(closeButton);
      this.headerElement.appendChild(controlsElement);
      
      // 设置拖动功能
      this.setupDraggable();
      
      // 字幕内容区
      this.contentElement = document.createElement('div');
      this.contentElement.className = 'yt-subtitle-content';
      
      // 添加到DOM
      this.floaterElement.appendChild(this.headerElement);
      this.floaterElement.appendChild(this.contentElement);
      document.body.appendChild(this.floaterElement);
      
      logDebug('浮窗DOM元素创建成功');
    } catch (error) {
      logDebug('创建浮窗元素失败', { error: error.message, stack: error.stack });
      throw error;
    }
  }
  
  /**
   * 设置浮窗可拖动
   */
  setupDraggable() {
    logDebug('设置浮窗可拖动');
    this.headerElement.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      const rect = this.floaterElement.getBoundingClientRect();
      this.dragOffsetX = e.clientX - rect.left;
      this.dragOffsetY = e.clientY - rect.top;
      
      // 防止文本选择
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const x = e.clientX - this.dragOffsetX;
        const y = e.clientY - this.dragOffsetY;
        
        // 保持在视口内
        const maxX = window.innerWidth - this.floaterElement.offsetWidth;
        const maxY = window.innerHeight - this.floaterElement.offsetHeight;
        
        this.floaterElement.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
        this.floaterElement.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
      }
    });
    
    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
  }
  
  /**
   * 切换最小化状态
   */
  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    logDebug('切换最小化状态', { isMinimized: this.isMinimized });
    
    if (this.isMinimized) {
      this.floaterElement.classList.add('yt-subtitle-minimized');
    } else {
      this.floaterElement.classList.remove('yt-subtitle-minimized');
    }
  }
  
  /**
   * 显示浮窗
   */
  show() {
    logDebug('显示浮窗');
    if (!this.floaterElement) {
      logDebug('浮窗元素不存在，重新初始化');
      this.initialize();
      return;
    }
    
    this.floaterElement.style.display = 'block';
  }
  
  /**
   * 隐藏浮窗
   */
  hide() {
    logDebug('隐藏浮窗');
    if (this.floaterElement) {
      this.floaterElement.style.display = 'none';
    }
  }
  
  /**
   * 加载用户设置
   */
  async loadSettings() {
    return new Promise(resolve => {
      chrome.storage.sync.get({
        // 基础设置默认值
        isEnabled: true,
        language: 'en',
        fontSize: 16,
        opacity: 0.8,
        
        // 翻译设置默认值
        translationEnabled: false,
        translationLanguage: 'zh',
        translationRatio: 1.0,
        apiKey: '',
        selectedModel: ''
      }, (items) => {
        logDebug('加载设置', items);
        this.settings = items;
        resolve(items);
      });
    });
  }
  
  /**
   * 更新设置
   */
  updateSettings(newSettings) {
    logDebug('更新设置', newSettings);
    
    // 保存旧设置以便比较
    const oldSettings = { ...this.settings };
    
    // 更新设置
    this.settings = { ...this.settings, ...newSettings };
    this.applySettings();
    
    // 如果字幕语言改变或翻译设置改变，重新获取/翻译字幕
    if (newSettings.language && newSettings.language !== oldSettings.language) {
      logDebug('字幕语言已更改，重新获取字幕', { 
        oldLanguage: oldSettings.language, 
        newLanguage: newSettings.language 
      });
      // 清空翻译缓存
      this.translationCache = {};
      this.fetchTranscript();
    } else if (
      // 如果翻译设置发生变化但字幕已获取，重新渲染现有字幕
      (newSettings.translationEnabled !== undefined && newSettings.translationEnabled !== oldSettings.translationEnabled) ||
      (newSettings.translationLanguage && newSettings.translationLanguage !== oldSettings.translationLanguage) ||
      (newSettings.translationRatio && newSettings.translationRatio !== oldSettings.translationRatio)
    ) {
      logDebug('翻译设置已更改，重新渲染字幕', { 
        oldSettings: {
          enabled: oldSettings.translationEnabled,
          language: oldSettings.translationLanguage,
          ratio: oldSettings.translationRatio
        },
        newSettings: {
          enabled: this.settings.translationEnabled,
          language: this.settings.translationLanguage,
          ratio: this.settings.translationRatio
        }
      });
      // 清空翻译缓存
      this.translationCache = {};
      if (this.transcript && this.transcript.length > 0) {
        this.renderTranscript();
      }
    }
  }
  
  /**
   * 应用设置到浮窗
   */
  applySettings() {
    logDebug('应用设置到浮窗');
    if (!this.floaterElement) {
      logDebug('浮窗元素不存在，无法应用设置');
      return;
    }
    
    // 设置字体大小
    this.contentElement.style.fontSize = `${this.settings.fontSize}px`;
    
    // 设置透明度
    this.floaterElement.style.opacity = this.settings.opacity;
    
    logDebug('设置已应用', { 
      fontSize: this.settings.fontSize, 
      opacity: this.settings.opacity,
      translationEnabled: this.settings.translationEnabled
    });
  }
  
  /**
   * 获取视频字幕
   */
  async fetchTranscript() {
    logDebug('开始获取视频字幕');
    if (!this.videoId) {
      logDebug('无视频ID，无法获取字幕');
      this.contentElement.innerHTML = '<div class="yt-subtitle-text error">错误: 无法获取视频ID</div>';
      return;
    }
    
    try {
      logDebug('显示加载状态');
      this.contentElement.innerHTML = '<div class="yt-subtitle-text">加载字幕中...</div>';
      
      // 向背景脚本请求字幕数据
      logDebug('向背景脚本发送获取字幕请求', { 
        videoId: this.videoId, 
        language: this.settings.language 
      });
      
      // 检查chrome.runtime是否可用
      if (!chrome.runtime) {
        logDebug('chrome.runtime不可用');
        this.contentElement.innerHTML = '<div class="yt-subtitle-text error">错误: 扩展API不可用</div>';
        return;
      }
      
      // 使用Promise包装消息发送，添加重试机制
      const sendMessageWithRetry = (retries = 3) => {
        return new Promise((resolve, reject) => {
          try {
            chrome.runtime.sendMessage({
              action: 'getTranscript',
              videoId: this.videoId,
              language: this.settings.language
            }, (response) => {
              const lastError = chrome.runtime.lastError;
              if (lastError) {
                logDebug('发送消息时出错', { error: lastError.message });
                
                // 如果是连接错误且还有重试次数，则重试
                if (lastError.message.includes('Receiving end does not exist') && retries > 0) {
                  logDebug(`重试发送消息，剩余重试次数: ${retries-1}`);
                  setTimeout(() => {
                    sendMessageWithRetry(retries - 1)
                      .then(resolve)
                      .catch(reject);
                  }, 1000); // 等待1秒后重试
                } else {
                  reject(new Error(`与背景脚本通信失败: ${lastError.message}`));
                }
                return;
              }
              
              resolve(response);
            });
          } catch (error) {
            logDebug('发送消息时发生异常', { error: error.message });
            reject(error);
          }
        });
      };
      
      // 发送消息并处理响应
      const response = await sendMessageWithRetry();
      logDebug('收到字幕响应', response);
      
      if (response && response.success) {
        this.transcript = response.transcript;
        logDebug('成功获取字幕', { count: this.transcript.length });
        this.renderTranscript();
      } else {
        const errorMsg = response ? response.error : '获取字幕失败，未收到有效响应';
        logDebug('获取字幕失败', { error: errorMsg });
        this.contentElement.innerHTML = `<div class="yt-subtitle-text error">错误: ${errorMsg}</div>`;
      }
    } catch (error) {
      logDebug('获取字幕时出错', { error: error.message, stack: error.stack });
      this.contentElement.innerHTML = `<div class="yt-subtitle-text error">错误: ${error.message}</div>`;
    }
  }
  
  /**
   * 翻译字幕文本
   * @param {string} text - 要翻译的文本
   * @returns {Promise<string>} - 翻译后的文本
   */
  async translateSubtitle(text) {
    if (!text || !this.settings.translationEnabled) {
      return text;
    }
    
    // 创建缓存键，包括文本、目标语言、翻译比例和模型ID
    const cacheKey = `${text}|${this.settings.translationLanguage}|${this.settings.translationRatio}|${this.settings.selectedModel || 'default'}`;
    
    // 检查缓存是否有翻译结果
    if (this.translationCache[cacheKey]) {
      logDebug('使用缓存的翻译结果', { text, translated: this.translationCache[cacheKey] });
      return this.translationCache[cacheKey];
    }
    
    try {
      logDebug('翻译字幕文本', { 
        text, 
        targetLanguage: this.settings.translationLanguage,
        translationRatio: this.settings.translationRatio,
        model: this.settings.selectedModel || '默认模型'
      });
      
      // 向背景脚本发送翻译请求
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'translateSubtitle',
          text: text,
          targetLanguage: this.settings.translationLanguage,
          translationRatio: this.settings.translationRatio,
          apiKey: this.settings.apiKey, // 将API密钥传递给背景脚本
          modelId: this.settings.selectedModel // 将选择的模型ID传递给背景脚本
        }, (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            logDebug('发送翻译请求失败', { error: lastError.message });
            reject(new Error(`发送翻译请求失败: ${lastError.message}`));
            return;
          }
          resolve(response);
        });
      });
      
      if (response && response.success) {
        logDebug('翻译成功', { original: text, translated: response.translatedText });
        // 缓存翻译结果
        this.translationCache[cacheKey] = response.translatedText;
        return response.translatedText;
      } else {
        const errorMsg = response ? response.error : '翻译失败，未收到有效响应';
        logDebug('翻译失败', { error: errorMsg });
        return `${text} [翻译失败]`;
      }
    } catch (error) {
      logDebug('翻译过程中出错', { error: error.message, stack: error.stack });
      return `${text} [翻译错误: ${error.message}]`;
    }
  }
  
  /**
   * 渲染字幕到浮窗
   */
  async renderTranscript() {
    logDebug('渲染字幕到浮窗');
    if (!this.contentElement) {
      logDebug('内容元素不存在，无法渲染字幕');
      return;
    }
    
    if (!this.transcript || this.transcript.length === 0) {
      logDebug('字幕数据为空，无法渲染');
      this.contentElement.innerHTML = '<div class="yt-subtitle-text">未找到字幕数据</div>';
      return;
    }
    
    logDebug('清空内容元素');
    this.contentElement.innerHTML = '';
    
    // 为每个字幕创建元素
    logDebug('开始创建字幕元素', { count: this.transcript.length });
    try {
      const isTranslationEnabled = this.settings.translationEnabled;
      
      // 创建字幕元素
      for (let index = 0; index < this.transcript.length; index++) {
        const item = this.transcript[index];
        
        // 创建字幕容器
        const subtitleContainer = document.createElement('div');
        subtitleContainer.className = 'yt-subtitle-container';
        subtitleContainer.dataset.index = index;
        subtitleContainer.dataset.start = item.start;
        subtitleContainer.dataset.end = item.end;
        
        // 创建原文字幕元素
        const originalSubtitle = document.createElement('div');
        originalSubtitle.className = 'yt-subtitle-text original';
        originalSubtitle.textContent = item.text;
        subtitleContainer.appendChild(originalSubtitle);
        
        // 如果启用了翻译，添加翻译字幕
        if (isTranslationEnabled) {
          // 添加加载中状态
          const translatedSubtitle = document.createElement('div');
          translatedSubtitle.className = 'yt-subtitle-text translated';
          translatedSubtitle.textContent = '翻译中...';
          subtitleContainer.appendChild(translatedSubtitle);
          
          // 异步翻译并更新元素
          this.translateSubtitle(item.text).then(translatedText => {
            translatedSubtitle.textContent = translatedText;
          }).catch(error => {
            translatedSubtitle.textContent = `翻译失败: ${error.message}`;
            translatedSubtitle.classList.add('error');
          });
        }
        
        // 点击字幕时跳转到视频对应时间点
        subtitleContainer.addEventListener('click', () => {
          const videoElement = document.querySelector('video');
          if (videoElement) {
            videoElement.currentTime = item.start;
          }
        });
        
        this.contentElement.appendChild(subtitleContainer);
      }
      
      logDebug('字幕元素创建完成');
    } catch (error) {
      logDebug('创建字幕元素时出错', { error: error.message, stack: error.stack });
      this.contentElement.innerHTML = `<div class="yt-subtitle-text error">错误: 渲染字幕失败 - ${error.message}</div>`;
    }
  }
  
  /**
   * 设置视频时间监听，以便高亮当前字幕
   */
  setupVideoTimeListener() {
    logDebug('设置视频时间监听');
    // 查找视频元素
    const videoElement = document.querySelector('video');
    if (!videoElement) {
      logDebug('未找到视频元素');
      return;
    }
    
    logDebug('找到视频元素，添加timeupdate事件监听');
    // 监听时间更新事件
    videoElement.addEventListener('timeupdate', () => {
      this.currentTime = videoElement.currentTime;
      this.highlightCurrentSubtitle();
    });
  }
  
  /**
   * 翻译当前字幕
   */
  async translateCurrentSubtitle() {
    if (!this.transcript || this.currentSubtitleIndex === -1) {
      logDebug('无法翻译当前字幕 - 无字幕数据或未选中字幕');
      return;
    }
    
    const currentSubtitle = this.transcript[this.currentSubtitleIndex];
    logDebug('开始翻译当前字幕', { 
      index: this.currentSubtitleIndex,
      text: currentSubtitle.text,
      model: this.settings.selectedModel || 'default'
    });
    
    try {
      const translatedText = await this.translateSubtitle(currentSubtitle.text);
      
      // 更新DOM中的翻译文本
      const subtitleContainer = this.contentElement.querySelector(
        `.yt-subtitle-container[data-index="${this.currentSubtitleIndex}"]`
      );
      
      if (subtitleContainer) {
        const translatedElement = subtitleContainer.querySelector('.yt-subtitle-text.translated');
        if (translatedElement) {
          translatedElement.textContent = translatedText;
          logDebug('成功更新翻译文本', { 
            translatedText,
            model: this.settings.selectedModel || 'default'
          });
        }
      }
    } catch (error) {
      logDebug('翻译当前字幕失败', { 
        error: error.message,
        stack: error.stack,
        model: this.settings.selectedModel || 'default'
      });
    }
  }

  /**
   * 高亮当前字幕
   */
  highlightCurrentSubtitle() {
    if (!this.transcript || this.transcript.length === 0) return;
    
    // 查找当前时间对应的字幕
    const currentIndex = this.transcript.findIndex(item => 
      this.currentTime >= item.start && this.currentTime <= item.end
    );
    
    // 如果字幕索引没有改变，则不执行更新
    if (currentIndex === this.currentSubtitleIndex) return;
    
    // 更新当前字幕索引
    this.currentSubtitleIndex = currentIndex;
    
    if (currentIndex !== -1) {
      logDebug('当前字幕更新', { 
        index: currentIndex, 
        time: this.currentTime, 
        text: this.transcript[currentIndex].text 
      });
      
      // 如果启用了翻译，尝试翻译当前字幕
      if (this.settings.translationEnabled) {
        this.translateCurrentSubtitle();
      }
    }
    
    // 移除所有活动类
    const subtitleContainers = this.contentElement.querySelectorAll('.yt-subtitle-container');
    subtitleContainers.forEach(el => el.classList.remove('active'));
    
    // 如果找到当前字幕，添加活动类并滚动到可见区域
    if (currentIndex !== -1) {
      const currentElement = this.contentElement.querySelector(`.yt-subtitle-container[data-index="${currentIndex}"]`);
      if (currentElement) {
        currentElement.classList.add('active');
        
        // 滚动到当前字幕可见
        currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }
}

// 创建并初始化字幕浮窗
logDebug('创建字幕浮窗实例');
const subtitleFloater = new YouTubeSubtitleFloater();

// 在YouTube播放页面自动检测
if (window.location.href.includes('youtube.com/watch')) {
  logDebug('检测到YouTube播放页面');
  // 检查插件是否启用
  chrome.storage.sync.get(['isEnabled'], function(data) {
    logDebug('插件启用状态', data);
    if (data.isEnabled) {
      logDebug('插件已启用，初始化浮窗');
      subtitleFloater.initialize();
    } else {
      logDebug('插件未启用，不初始化浮窗');
    }
  });
}