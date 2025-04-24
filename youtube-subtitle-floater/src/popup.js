/**
 * YouTube字幕浮窗插件的弹出窗口脚本
 * 处理用户界面交互和设置保存
 */

// 日志前缀，与其他脚本一致
const LOG_PREFIX = '[YT-SUB-DEBUG]';

// 添加日志函数
function logDebug(message, data = null) {
  const logMessage = `${LOG_PREFIX} [Popup] ${message}`;
  if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
}

// 当弹出窗口加载完成时执行
document.addEventListener('DOMContentLoaded', async () => {
  logDebug('弹出窗口已加载');
  
  // 获取基础设置UI元素
  const toggleButton = document.getElementById('toggleButton');
  const fontSizeInput = document.getElementById('fontSizeInput');
  const opacityInput = document.getElementById('opacityInput');
  const widthInput = document.getElementById('widthInput');
  const heightInput = document.getElementById('heightInput');
  const saveButton = document.getElementById('saveButton');
  const statusText = document.getElementById('statusText');
  
  // 获取翻译设置UI元素
  const enableTranslationCheckbox = document.getElementById('enableTranslationCheckbox');
  const translationLanguageSelect = document.getElementById('translationLanguageSelect');
  const translationRatioInput = document.getElementById('translationRatioInput');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const apiKeyNotice = document.getElementById('apiKeyNotice');
  const modelSelect = document.getElementById('modelSelect');
  
  // 获取标签页导航元素
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanels = document.querySelectorAll('.tab-panel');
  
  // 加载当前设置
  logDebug('加载当前设置');
  const settings = await loadSettings();
  
  // 更新UI以反映当前设置
  updateUI(settings);
  
  // 添加宽度和高度输入的事件监听器
  widthInput.addEventListener('input', () => {
    document.documentElement.style.setProperty('--floater-width', `${widthInput.value}px`);
    document.getElementById('widthValue').textContent = `${widthInput.value}px`;
    saveSettings();
  });
  
  heightInput.addEventListener('input', () => {
    document.documentElement.style.setProperty('--floater-height', `${heightInput.value}px`);
    document.getElementById('heightValue').textContent = `${heightInput.value}px`;
    saveSettings();
  });
  
  // 获取可用的模型列表
  async function updateAvailableModels(apiKey) {
    try {
      const response = await fetch('https://api.siliconflow.cn/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '无法获取错误详情');
        throw new Error(`获取模型列表失败: ${response.status} ${response.statusText}\n${errorText}`);
      }
      
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error(`解析响应数据失败: ${parseError.message}`);
      }
      
      if (!data || !Array.isArray(data.data)) {
        throw new Error('响应数据格式不正确');
      }
      
      // 使用所有返回的模型数据
      const filteredModels = data.data.map(model => model.id);
      
      if (filteredModels.length === 0) {
        throw new Error('未找到可用的模型');
      }
      
      // 更新模型选择下拉框
      modelSelect.innerHTML = '';
      filteredModels.forEach(modelId => {
        const option = document.createElement('option');
        option.value = modelId;
        option.textContent = modelId;
        modelSelect.appendChild(option);
      });
      
      // 启用模型选择
      modelSelect.disabled = false;
      
      // 如果之前没有选择模型，选择第一个可用模型
      if (!modelSelect.value && filteredModels.length > 0) {
        modelSelect.value = filteredModels[0];
      }
      
      return filteredModels;
    } catch (error) {
      logDebug('获取模型列表失败', { 
        error: error.message,
        stack: error.stack,
        apiKey: apiKey ? apiKey.substring(0, 5) + '...' : '未提供'
      });
      modelSelect.innerHTML = '<option value="">获取模型列表失败</option>';
      modelSelect.disabled = true;
      throw error;
    }
  }
  
  // 获取模型列表按钮点击事件
  const fetchModelsButton = document.getElementById('fetchModelsButton');
  fetchModelsButton.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      logDebug('尝试获取模型列表', { apiKey: apiKey.substring(0, 5) + '...' });
      try {
        statusText.textContent = '正在获取模型列表...';
        statusText.style.color = '#f39c12';
        
        logDebug('发送API请求获取模型列表');
        const startTime = Date.now();
        await updateAvailableModels(apiKey);
        const endTime = Date.now();
        
        logDebug('成功获取模型列表', { timeSpent: endTime - startTime + 'ms' });
        statusText.textContent = '成功获取可用模型列表';
        statusText.style.color = '#34a853';
      } catch (error) {
        logDebug('获取模型列表失败', { 
          error: error.message, 
          stack: error.stack,
          apiKey: apiKey.substring(0, 5) + '...'
        });
        statusText.textContent = '获取模型列表失败: ' + (error.message || '未知错误');
        statusText.style.color = '#e74c3c';
        
        // 禁用模型选择框并显示错误状态
        modelSelect.disabled = true;
        modelSelect.innerHTML = '<option value="">获取模型列表失败</option>';
      }
    } else {
      logDebug('未提供API密钥');
      statusText.textContent = '请先输入API密钥';
      statusText.style.color = '#f39c12';
      modelSelect.innerHTML = '<option value="">请先输入API密钥...</option>';
      modelSelect.disabled = true;
    }
  });

  // 监听API密钥输入变化
  apiKeyInput.addEventListener('input', () => {
    if (!apiKeyInput.value.trim()) {
      modelSelect.innerHTML = '<option value="">请先输入API密钥...</option>';
      modelSelect.disabled = true;
    }
  });
  
  // 监听模型选择变化
  modelSelect.addEventListener('change', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey && modelSelect.value) {
      logDebug('模型选择变化', { selectedModel: modelSelect.value });
      
      // 保存当前设置
      const settings = await loadSettings();
      settings.selectedModel = modelSelect.value;
      await saveSettings(settings);
      
      // 获取当前标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab && tab.url && tab.url.includes('youtube.com/watch')) {
        // 向内容脚本发送消息触发翻译重试
        chrome.tabs.sendMessage(tab.id, { 
          action: 'retryTranslation',
          model: modelSelect.value
        }, (response) => {
          if (chrome.runtime.lastError) {
            logDebug('发送重试翻译消息失败', { error: chrome.runtime.lastError.message });
          } else {
            logDebug('成功发送重试翻译消息', response);
          }
        });
      }
    }
  });
  
  // 添加翻译功能开关的事件监听器
  enableTranslationCheckbox.addEventListener('change', async () => {
    if (enableTranslationCheckbox.checked && (!apiKeyInput.value || apiKeyInput.value.trim() === '')) {
      // 如果启用翻译但没有API密钥，显示警告
      statusText.textContent = '警告: 启用翻译功能需要设置API密钥';
      statusText.style.color = '#f39c12'; // 黄色警告
      apiKeyNotice.style.color = '#e74c3c'; // 红色提示
      
      // 聚焦到API密钥输入框
      apiKeyInput.focus();
    } else if (!enableTranslationCheckbox.checked) {
      const settings = await loadSettings();
      settings.enableTranslation = false;
      await saveSettings(settings);
      // 如果禁用翻译，恢复正常状态
      statusText.textContent = '插件已启用';
      statusText.style.color = '';
      apiKeyNotice.style.color = '#f39c12'; // 恢复默认颜色
    }
  });
  
  // 设置标签切换
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // 移除所有标签的活动状态
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabPanels.forEach(panel => panel.classList.remove('active'));
      
      // 设置当前标签为活动状态
      button.classList.add('active');
      const targetTabId = `${button.dataset.tab}-panel`;
      document.getElementById(targetTabId).classList.add('active');
    });
  });
  
  // 切换按钮点击事件
  toggleButton.addEventListener('click', async () => {
    logDebug('切换按钮被点击');
    const isEnabled = toggleButton.textContent === '禁用插件';
    
    // 更新设置
    await chrome.storage.sync.set({ isEnabled: !isEnabled });
    
    // 更新按钮文本
    toggleButton.textContent = isEnabled ? '启用插件' : '禁用插件';
    
    // 获取当前标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url && tab.url.includes('youtube.com/watch')) {
      logDebug('向内容脚本发送状态更新', { isEnabled: !isEnabled });
      
      // 向内容脚本发送消息
      chrome.tabs.sendMessage(tab.id, { 
        action: isEnabled ? 'hideFloater' : 'showFloater' 
      }, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          logDebug('发送消息失败', { error: lastError.message });
          statusText.textContent = '无法与页面通信，请刷新页面';
        } else {
          logDebug('消息发送成功', response);
          statusText.textContent = isEnabled ? '插件已禁用' : '插件已启用';
        }
      });
    } else {
      logDebug('当前页面不是YouTube视频页面');
      statusText.textContent = '请在YouTube视频页面使用此插件';
    }
  });
  
  // 保存按钮点击事件
  saveButton.addEventListener('click', async () => {
    logDebug('保存按钮被点击');
    
    // 获取当前设置值
    const settings = {
      // 基础设置
      isEnabled: toggleButton.textContent === '禁用插件',
      fontSize: parseInt(fontSizeInput.value, 10),
      opacity: parseFloat(opacityInput.value),
      
      // 翻译设置
      translationEnabled: enableTranslationCheckbox.checked,
      translationLanguage: translationLanguageSelect.value,
      translationRatio: parseFloat(translationRatioInput.value),
      apiKey: apiKeyInput.value.trim(),
      selectedModel: modelSelect.value
    };
    
    logDebug('准备保存设置', settings);
    
    // 验证API密钥（如果启用了翻译）
    if (settings.translationEnabled) {
      const validationResult = await validateApiKey(settings.apiKey);
      if (!validationResult.valid) {
        statusText.textContent = validationResult.message;
        statusText.style.color = '#e74c3c';
        return;
      }
      
      // 如果启用了翻译但没有选择模型，显示警告
      if (!settings.selectedModel) {
        statusText.textContent = '警告: 请选择一个翻译模型';
        statusText.style.color = '#f39c12';
        return;
      }
    }
    
    // 保存设置到存储
    try {
      await chrome.storage.sync.set(settings);
      logDebug('设置已保存', settings);
      
      // 更新状态文本
      statusText.textContent = '设置已保存';
      statusText.style.color = '#34a853';
      
      // 获取当前标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab && tab.url && tab.url.includes('youtube.com/watch')) {
        // 向内容脚本发送更新设置消息
        chrome.tabs.sendMessage(tab.id, { 
          action: 'updateSettings',
          settings: settings
        }, (response) => {
          if (chrome.runtime.lastError) {
            logDebug('发送更新设置消息失败', { error: chrome.runtime.lastError.message });
          } else {
            logDebug('成功发送更新设置消息', response);
          }
        });
      }
      
      // 3秒后恢复状态文本
      setTimeout(() => {
        statusText.textContent = settings.isEnabled ? '插件已启用' : '插件已禁用';
        statusText.style.color = '';
      }, 3000);
    } catch (error) {
      logDebug('保存设置失败', { error: error.message, stack: error.stack });
      statusText.textContent = '保存设置失败: ' + error.message;
      statusText.style.color = '#e74c3c';
    }
  });
  
  // 加载设置函数
  async function loadSettings() {
    return new Promise(resolve => {
      chrome.storage.sync.get({
        // 基础设置默认值
        isEnabled: true,
        fontSize: 16,
        opacity: 0.8,
        
        // 翻译设置默认值
        translationEnabled: false,
        translationLanguage: 'zh',
        translationRatio: 1.0,
        apiKey: '',
        selectedModel: ''
      }, (items) => {
        logDebug('加载的设置', items);
        resolve(items);
      });
    });
  }
  
  // 更新UI函数
  function updateUI(settings) {
    logDebug('更新UI', settings);
    
    // 更新基础设置UI
    toggleButton.textContent = settings.isEnabled ? '禁用插件' : '启用插件';
    fontSizeInput.value = settings.fontSize;
    opacityInput.value = settings.opacity;
    
    // 更新翻译设置UI
    enableTranslationCheckbox.checked = settings.translationEnabled;
    translationLanguageSelect.value = settings.translationLanguage;
    translationRatioInput.value = settings.translationRatio;
    apiKeyInput.value = settings.apiKey || '';
    if (settings.selectedModel) {
      modelSelect.value = settings.selectedModel;
    }
    
    // 如果启用了翻译但没有设置API密钥，显示警告
    if (settings.translationEnabled && (!settings.apiKey || settings.apiKey.trim() === '')) {
      statusText.textContent = '警告: 翻译功能已启用但未设置API密钥';
      statusText.style.color = '#f39c12'; // 黄色警告
    } else {
      // 更新状态文本
      statusText.textContent = settings.isEnabled ? '插件已启用' : '插件已禁用';
      statusText.style.color = ''; // 恢复正常颜色
    }
    
    // 更新API密钥输入框的提示
    // 移除了API密钥提示文本的更新逻辑，因为HTML中已有静态提示文本
  }

  // 添加API密钥验证函数
  async function validateApiKey(apiKey) {
    // 检查是否为空
    if (!apiKey || apiKey.trim() === '') {
      return { valid: false, message: 'API密钥不能为空' };
    }
    
    // 不再验证API密钥格式，只要不为空就认为有效
    return { valid: true, message: 'API密钥已设置' };
  }
});