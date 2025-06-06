# YouTube 字幕浮窗

一个浏览器扩展，用于从 YouTube 视频中提取字幕并通过可拖动浮窗展示，支持AI翻译功能。

## 功能特点

- **字幕提取与显示**
  - 从 YouTube 视频中提取字幕
  - 通过可拖动浮窗实时显示字幕
  - 支持多种语言字幕
  - 跟随视频播放自动高亮当前字幕
  - 点击字幕可跳转到视频对应时间点

- **字幕浮窗控制**
  - 可自定义字体大小和透明度
  - 浮窗支持最小化和关闭
  - 支持调整浮窗大小和位置
  - 拖拽标题栏可移动浮窗位置

- **AI翻译功能**
  - 支持将字幕翻译成多种语言
  - 可选择不同的AI模型进行翻译
  - 可自定义翻译比例(0-1)，实现混合语言效果
  - 支持翻译缓存，避免重复翻译
  - 提供API密钥管理功能
  - 可动态获取可用模型列表

- **高级功能**
  - 支持字幕自动滚动
  - 提供字幕高亮效果
  - 支持字幕点击跳转视频时间点
  - 实时同步视频播放进度
  - 提供详细的日志记录功能

- **用户界面**
  - 响应式设计，适配不同屏幕尺寸
  - 简洁直观的设置界面
  - 提供状态反馈和错误提示
  - 支持多标签页设置分类

## 技术实现

该插件基于 Chrome 扩展开发，主要利用以下技术：
- Chrome 扩展 API
- JavaScript ES6+
- YouTube 字幕提取技术
- 拖拽功能实现
- 响应式 UI 设计
- **硅基流动API**：用于AI翻译功能

## 安装方法

### 通过 Chrome 网上应用店安装（未发布）
1. 前往 Chrome 网上应用店
2. 搜索 "YouTube 字幕浮窗"
3. 点击 "添加到 Chrome"

### 开发者模式安装
1. 下载或克隆此仓库到本地
2. 打开 Chrome 浏览器，输入 `chrome://extensions/`
3. 开启右上角的 "开发者模式"
4. 点击 "加载已解压的扩展程序"
5. 选择此项目文件夹

## 使用方法

1. 安装插件后，打开任意 YouTube 视频页面
2. 点击浏览器工具栏中的插件图标
3. 在弹出窗口中选择字幕语言和其他设置
4. 点击 "显示/隐藏浮窗" 按钮启用字幕浮窗
5. 拖动浮窗标题栏可以调整位置
6. 点击最小化按钮可收起浮窗，再次点击展开
7. 点击关闭按钮可关闭浮窗

### 翻译功能使用

1. 在插件设置中启用翻译功能
2. 输入您的硅基流动API密钥
3. 点击"获取模型列表"按钮获取可用模型
4. 从下拉菜单中选择要使用的模型
5. 选择目标翻译语言
6. 调整翻译比例（0-1之间，1表示完全翻译）
7. 保存设置后，字幕将自动翻译

## API密钥获取

要使用翻译功能，您需要获取硅基流动API密钥：

1. 访问 [硅基流动官网](https://cloud.siliconflow.cn/)
2. 注册并登录您的账户
3. 在账户设置中创建API密钥
4. 将API密钥复制到插件设置中


## 注意事项

- 本插件仅适用于带有字幕的 YouTube 视频
- 部分视频可能因为版权或设置原因无法提取字幕
- 字幕提取方法可能因 YouTube 界面更新而失效
- 翻译功能需要有效的API密钥和网络连接
- 翻译质量取决于所选模型的能力

## 开发计划

- [x] 添加字幕翻译功能
- [x] 支持模型选择
- [ ] 支持更多视频平台（如 Bilibili、Vimeo 等）
- [ ] 支持自定义主题和颜色
- [ ] 添加字幕搜索功能
- [ ] 支持导出字幕
- [ ] 添加更多翻译服务提供商

## 许可证

MIT License