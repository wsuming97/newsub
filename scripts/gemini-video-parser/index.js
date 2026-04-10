import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import chokidar from "chokidar";
import { fileURLToPath } from "url";

// 加载环境变量
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置，优先使用环境变量中的代理地址，否则使用默认值
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ 错误: 请在 .env 文件中配置 GEMINI_API_KEY");
  process.exit(1);
}

// 支持自定义的反代 URL
const baseUrl = process.env.GEMINI_BASE_URL;

// 初始化 SDK，如果有反代 URL 则注入 baseUrl 参数
const clientOptions = { apiKey: apiKey };
if (baseUrl) {
  clientOptions.baseUrl = baseUrl;
  console.log(`🔗 已启用自定义代理/基地址: ${baseUrl}`);
}

const ai = new GoogleGenAI(clientOptions);

// 定义提示词规则（你可以随意修改这里的规则）
const PROMPT_TEMPLATE = `
请仔细观察上传的这段视频，作为一名专业的视频内容分析师和 AI 视频生成提示词专家：
1. 提取出视频中的主要对象、人物特征及动作。
2. 描述环境背景、光线风格和整体色调。
3. 描述镜头的运动轨迹和景别变化。
要求：综合以上内容，输出一段连贯的、高质量的英文 Prompt，该 Prompt 将用于类似 Sora、Runway 的视频生成工具来复刻类似风格。
你只需输出最终的英文 Prompt，不需要任何多余的解释。
`;

// 设置监控的文件夹目录
const WATCH_DIR = path.join(__dirname, "videos");

// 确保监控目录存在
if (!fs.existsSync(WATCH_DIR)) {
  fs.mkdirSync(WATCH_DIR, { recursive: true });
}

// 记录正在处理的文件，防止重复触发
const processingFiles = new Set();

async function processVideo(filePath) {
  if (processingFiles.has(filePath)) return;
  processingFiles.add(filePath);

  const fileName = path.basename(filePath);
  const ext = path.extname(fileName);
  
  // 只处理常见视频格式
  if (!['.mp4', '.mov', '.avi', '.mkv'].includes(ext.toLowerCase())) {
    processingFiles.delete(filePath);
    return;
  }

  const resultFilePath = path.join(WATCH_DIR, `${path.basename(fileName, ext)}_prompt.txt`);
  
  // 如果已经生成过了，跳过
  if (fs.existsSync(resultFilePath)) {
    processingFiles.delete(filePath);
    return;
  }

  console.log(`\n🎬 发现新视频: ${fileName}`);
  console.log(`⏳ 步骤 1/3: 正在上传到 Gemini 服务器...`);

  try {
    const file = await ai.files.upload({
      file: filePath,
      mimeType: "video/mp4", // 统一以 mp4 处理或根据后缀推断
    });
    
    console.log(`✅ 上传成功。文件 ID: ${file.name}`);
    console.log(`⏳ 步骤 2/3: 等待服务端提取视频特征 (视文件大小可能需要数秒至一分钟)...`);

    // 轮询等待处理完成
    let fileState = await ai.files.get({ name: file.name });
    while (fileState.state === "PROCESSING") {
      process.stdout.write("."); // 打印等待点
      await new Promise((resolve) => setTimeout(resolve, 5000));
      fileState = await ai.files.get({ name: file.name });
    }
    console.log(); // 换行

    if (fileState.state === "FAILED") {
      throw new Error("❌ 服务端视频处理失败");
    }

    console.log(`⏳ 步骤 3/3: 服务端特征提取完毕，正在生成超强 Prompt...`);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", // 综合性价比最强的多模态模型
      contents: [
        file,
        PROMPT_TEMPLATE
      ],
      config: {
        temperature: 0.7,
      }
    });

    const promptText = response.text();
    
    // 将结果写入同名的 txt 文件
    fs.writeFileSync(resultFilePath, promptText, 'utf-8');
    
    console.log(`\n🎉 解析完成！`);
    console.log(`📍 提示词已保存至: ${resultFilePath}`);
    console.log(`📝 提示词预览：\n${promptText}\n`);

    // 清理云端文件节省配额
    try {
      await ai.files.delete({ name: file.name });
      console.log(`🧹 已清理云端临时缓存`);
    } catch (e) {
      console.error(`警告: 清理云端文件失败，可忽略: ${e.message}`);
    }

  } catch (error) {
    console.error(`\n❌ 处理视频 ${fileName} 时出错:`, error.message);
  } finally {
    processingFiles.delete(filePath);
  }
}

console.log(`\n======================================================`);
console.log(`🤖 Gemini 视频全自动解析脚本启动完毕！`);
console.log(`📂 请将您的视频直接放入目录：${WATCH_DIR}`);
console.log(`👀 脚本正在持续监听中...\n`);

// 启动文件夹监听
const watcher = chokidar.watch(WATCH_DIR, {
  ignored: /(^|[\/\\])\../, // 忽略隐藏文件
  persistent: true,
  awaitWriteFinish: { // 等待文件完整写入目录再触发
    stabilityThreshold: 2000,
    pollInterval: 100
  }
});

watcher.on('add', filePath => {
  // 当有新文件加入时触发
  processVideo(filePath);
});
