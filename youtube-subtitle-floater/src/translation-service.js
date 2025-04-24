/**
 * 字幕翻译服务
 * 使用硅基流动API进行翻译
 */

// 日志前缀
const LOG_PREFIX = '[YT-SUB-DEBUG]';

/**
 * 记录调试日志
 * @param {string} message - 日志消息
 * @param {any} data - 可选的数据对象
 */
function logDebug(message, data = null) {
  const logMessage = `${LOG_PREFIX} [Translation] ${message}`;
  if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
}

/**
 * 翻译服务类
 */
class TranslationService {
  /**
   * 创建翻译服务实例
   * @param {string} apiKey - API密钥
   */
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.siliconflow.cn/v1';
    this.model = null;
    this.availableModels = [];
    if (apiKey) {
      this.updateAvailableModels();
    }
  }
  
  /**
   * 更新API密钥
   * @param {string} apiKey - 新的API密钥
   */
  updateApiKey(apiKey) {
    this.apiKey = apiKey;
    logDebug('API密钥已更新', { apiKey: apiKey ? apiKey.substring(0, 5) + '...' : '未设置' });
    if (apiKey) {
      this.updateAvailableModels();
    }
  }

  /**
   * 设置当前使用的模型
   * @param {string} modelId - 模型ID
   */
  setModel(modelId) {
    if (this.availableModels.includes(modelId)) {
      this.model = modelId;
      logDebug('设置当前模型', { model: this.model });
    } else {
      logDebug('尝试设置不存在的模型', { model: modelId });
      throw new Error(`模型 ${modelId} 不在可用模型列表中`);
    }
  }

  /**
   * 获取可用的模型列表
   * @returns {Promise<Array<string>>} 可用模型ID列表
   */
  async updateAvailableModels() {
    try {
      if (!this.apiKey) {
        throw new Error('API密钥未设置，请先配置API密钥');
      }

      logDebug('开始获取可用模型列表', {
        baseUrl: this.baseUrl,
        apiKeyPrefix: this.apiKey ? this.apiKey.substring(0, 5) + '...' : '未设置'
      });
      
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '无法获取错误详情');
        throw new Error(`获取模型列表失败: ${response.status} ${response.statusText}\n${errorText}`);
      }
      
      const data = await response.json();
      logDebug('获取到模型列表', data);
      
      // 过滤出qwen和deepseek系列模型
      const filteredModels = data.data.filter(model => 
        model.id.startsWith('qwen/') || model.id.startsWith('deepseek/')
      ).map(model => model.id);
      
      logDebug('过滤后的模型列表', filteredModels);
      
      if (filteredModels.length === 0) {
        throw new Error('没有找到可用的qwen或deepseek模型');
      }
      
      this.availableModels = filteredModels;
      // 如果没有设置当前模型，设置为第一个可用模型
      if (!this.model) {
        this.model = filteredModels[0];
      }
      
      logDebug('更新模型列表完成', { 
        currentModel: this.model, 
        availableModels: this.availableModels 
      });

      return this.availableModels;
    } catch (error) {
      logDebug('获取模型列表失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 翻译字幕文本
   * @param {string} text - 原始字幕文本
   * @param {Object} options - 翻译选项
   * @param {string} options.targetLanguage - 目标语言
   * @param {number} options.translationRatio - 翻译比例 (0-1)
   * @param {string} [options.modelId] - 可选，指定使用的模型ID
   * @returns {Promise<string>} 翻译后的文本
   */
  async translateSubtitle(text, options) {
    try {
      logDebug('开始翻译字幕', { text, options });
      
      // 检查API密钥是否存在
      if (!this.apiKey) {
        throw new Error('API密钥未设置。请在设置中配置有效的API密钥。');
      }
      
      // 确定使用的模型
      const modelToUse = options.modelId || this.model;
      
      // 检查是否已选择模型
      if (!modelToUse) {
        throw new Error('未选择翻译模型。请在设置中选择一个模型。');
      }
      
      // 创建翻译提示
      const prompt = this.createTranslationPrompt(text, options);
      
      // 调用LLM API
      logDebug('使用选定模型翻译', { model: modelToUse });
      const response = await this.callLLMApi(prompt, modelToUse);
      return response;
    } catch (error) {
      logDebug('翻译出错', { error: error.message, stack: error.stack });
      throw error;
    }
  }
  
  /**
   * 创建翻译提示
   * @param {string} text - 原始字幕文本
   * @param {Object} options - 翻译选项
   * @returns {string} 翻译提示
   */
  createTranslationPrompt(text, options) {
    const { targetLanguage, translationRatio } = options;
    
    // 设置目标语言
    let languageName;
    switch (targetLanguage) {
      case 'zh':
        languageName = '中文';
        break;
      case 'en':
        languageName = '英语';
        break;
      case 'ja':
        languageName = '日语';
        break;
      case 'ko':
        languageName = '韩语';
        break;
      case 'fr':
        languageName = '法语';
        break;
      case 'de':
        languageName = '德语';
        break;
      case 'es':
        languageName = '西班牙语';
        break;
      case 'ru':
        languageName = '俄语';
        break;
      default:
        languageName = '中文';
    }
    
    // 处理翻译比例
    let ratioDescription = '';
    if (translationRatio < 1) {
      ratioDescription = `请按照${translationRatio * 100}%的比例将文本翻译成${languageName}，保持其余部分为原始语言，形成一个混合语言的句子。`;
    } else {
      ratioDescription = `请将整个文本翻译成${languageName}。`;
    }
    
    return `请翻译以下字幕文本。${ratioDescription}只返回翻译结果，不要解释或添加任何其他内容。\n\n原文: "${text}"`;
  }
  
  /**
   * 调用LLM API
   * @param {string} prompt - 提示文本
   * @param {string} modelName - 模型名称
   * @returns {Promise<string>} API响应
   */
  async callLLMApi(prompt, modelName) {
    try {
      logDebug('调用LLM API', { prompt, model: modelName });
      
      const requestBody = {
        model: modelName,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1000
      };
      
      logDebug('发送API请求', { url: `${this.baseUrl}/chat/completions`, body: requestBody });
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });
      
      logDebug('收到API响应', { status: response.status, statusText: response.statusText });
      
      if (!response.ok) {
        let errorDetail = '';
        try {
          const errorData = await response.json();
          errorDetail = JSON.stringify(errorData);
          logDebug('API错误详情', errorData);
        } catch (e) {
          // 无法解析错误响应为JSON，使用文本响应
          errorDetail = await response.text();
          logDebug('API错误文本', errorDetail);
        }
        throw new Error(`API请求失败: ${response.status} ${response.statusText} - ${errorDetail}`);
      }
      
      const data = await response.json();
      logDebug('API响应数据', data);
      
      // 提取返回的文本
      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        return data.choices[0].message.content.trim();
      } else {
        throw new Error(`API响应格式不符合预期: ${JSON.stringify(data)}`);
      }
    } catch (error) {
      logDebug('API调用出错', { error: error.message, stack: error.stack });
      throw error;
    }
  }
}

// 导出翻译服务
export default TranslationService;