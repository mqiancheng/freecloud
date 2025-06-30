import fetch from "node-fetch";

// 从环境变量读取配置
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const FREECLOUD_ACCOUNTS = process.env.FREECLOUD_ACCOUNTS;
const FREECLOUD_API_KEY = process.env.FREECLOUD_API_KEY;
const DELAY_SECONDS = process.env.DELAY_SECONDS;
const DELAY_TYPE = process.env.DELAY_TYPE;

// 验证必要的环境变量
if (!FREECLOUD_ACCOUNTS) {
  console.error("❌ 缺少环境变量 FREECLOUD_ACCOUNTS");
  process.exit(1);
}

if (!FREECLOUD_API_KEY) {
  console.error("❌ 缺少环境变量 FREECLOUD_API_KEY");
  process.exit(1);
}

// Worker URL配置 - 混淆存储
const _primaryParts = [
  'aHR0cHM6Ly93ZWJr', 'ZWVwYWxpdmUtc2Vy', 'dmVyLnFsZHlmLndv', 'cmtlcnMuZGV2Lw==',
  'aHR0cHM6Ly9mcmVl', 'Y2xvdWRuYXR0dWwu', 'd2hvZXIucHAudWEv'
];

// 重建URL
const WORKER_URL = Buffer.from(_primaryParts.slice(0, 4).join(''), 'base64').toString();
const SECONDARY_URL = Buffer.from(_primaryParts.slice(4, 7).join(''), 'base64').toString();

// 解析账号数据
let accounts = [];
try {
  accounts = JSON.parse(FREECLOUD_ACCOUNTS);
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("账号列表为空或格式错误");
  }
} catch (error) {
  console.error("❌ 解析 FREECLOUD_ACCOUNTS 失败:", error.message);
  console.error("请确保 FREECLOUD_ACCOUNTS 是有效的 JSON 数组格式");
  process.exit(1);
}

console.log(`📋 读取到 ${accounts.length} 个账号`);
accounts.forEach((account, index) => {
  const portLabel = account.type === 'nat.freecloud' ? 'UID' : '端口';
  console.log(`账号 ${index + 1}: ${account.username} (${portLabel}: ${account.port}) [${account.type || 'freecloud'}]`);
});

const timeout = '6W2iOZvG1qbo';

/**
 * 转义 Markdown 特殊字符
 * @param {string} text - 要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeMarkdown(text) {
  if (!text) return '';
  return text.toString()
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}

/**
 * 向 Telegram 推送消息
 * @param {string} message - 要发送的文本消息
 */
async function sendTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("⚠️ 未配置 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID，无法推送消息");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "MarkdownV2"
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();

    if (!response.ok) {
      console.warn(`⚠️ Telegram 消息推送失败: ${text}`);
    } else {
      console.log("✅ Telegram 消息已发送");
    }
  } catch (err) {
    console.error("❌ 推送 Telegram 消息异常：", err);
  }
}



/**
 * 根据账号类型分组
 * @param {Array} accounts - 账号列表
 * @returns {Object} 分组后的账号
 */
function groupAccountsByType(accounts) {
  const groups = {
    freecloud: [],
    natFreecloud: []
  };

  accounts.forEach(account => {
    if (account.type === 'nat.freecloud') {
      groups.natFreecloud.push(account);
    } else {
      groups.freecloud.push(account);
    }
  });

  return groups;
}

/**
 * 调用Worker处理所有账号
 * @param {Object} accountGroups - 分组后的账号 {freecloud: [], natFreecloud: []}
 * @param {string} apiKey - API Key
 * @returns {Object} 处理结果
 */
async function callWorkerForAllAccounts(accountGroups, apiKey) {
  try {
    console.log(`🔄 调用Worker处理所有账号...`);

    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Multi-Site-Mode': 'true',  // 标识多站点模式
        'X-Secondary-Worker-URL': SECONDARY_URL,  // 传递主URL2
        'X-Request-Timeout': timeout  // 版本验证码
      },
      body: JSON.stringify({
        accounts: accountGroups
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Worker处理完成`);
      return result;
    } else if (response.status === 401) {
      const error = await response.json();
      throw new Error(`API Key 认证失败: ${error.error}`);
    } else if (response.status === 426) {
      // 版本过旧，需要更新
      console.error('\n' + '='.repeat(60));
      console.error('❌ 版本验证失败！');
      console.error('='.repeat(60));
      console.error('您的代码版本过旧，请同步更新fork仓库');
      console.error('https://github.com/mqiancheng/freecloud');
      console.error('='.repeat(60) + '\n');
      throw new Error('版本验证失败，请更新代码');
    } else {
      const error = await response.json().catch(() => ({ error: '未知错误' }));
      throw new Error(`Worker调用失败: ${error.error}`);
    }
  } catch (error) {
    console.error(`❌ 调用Worker失败: ${error.message}`);
    throw error;
  }
}

/**
 * 调用Worker处理续期（多站点模式）
 * @param {Array} accounts - 账号列表
 * @param {string} apiKey - API Key
 * @returns {Object} 处理结果
 */
async function callWorkerWithRetry(accounts, apiKey) {
  // 按站点类型分组账号
  const groups = groupAccountsByType(accounts);

  console.log(`📋 账号分组情况:`);
  console.log(`  - freecloud.ltd: ${groups.freecloud.length} 个账号`);
  console.log(`  - nat.freecloud.ltd: ${groups.natFreecloud.length} 个账号`);

  try {
    // 调用Worker处理所有账号
    const result = await callWorkerForAllAccounts(groups, apiKey);
    return result;
  } catch (error) {
    console.error(`❌ 多站点处理失败: ${error.message}`);

    // 为所有账号生成失败记录
    const allResults = [];
    let totalFailed = 0;

    [...groups.freecloud, ...groups.natFreecloud].forEach(account => {
      allResults.push({
        username: account.username,
        type: account.type || 'freecloud',
        loginSuccess: false,
        renewSuccess: false,
        error: `Worker调用失败: ${error.message}`
      });
      totalFailed++;
    });

    return {
      processed: accounts.length,
      summary: {
        loginSuccess: 0,
        renewSuccess: 0,
        failed: totalFailed
      },
      results: allResults,
      key_usage: {
        this_operation: 0,
        total_used: 0
      }
    };
  }
}



/**
 * 按错误类型分组结果，合并相同的错误消息
 * @param {Array} results - 处理结果数组
 * @returns {Object} 分组后的结果 {errorGroups: {}, normalResults: []}
 */
function groupErrorsByType(results) {
  const errorGroups = {};
  const normalResults = [];

  results.forEach(result => {
    // 检查是否为需要合并的错误类型
    if (result.error && (
      result.error.includes('[ACCOUNT_LIMIT]') ||
      result.error.includes('API Key') ||
      result.error.includes('版本验证失败') ||
      result.error.includes('Worker调用失败')
    )) {
      // 提取纯净的错误消息（去掉标识符）
      let errorKey = result.error.replace('[ACCOUNT_LIMIT] ', '');

      // 简化错误消息显示
      if (errorKey.includes('API Key')) {
        errorKey = 'API Key错误';
      } else if (errorKey.includes('版本验证失败')) {
        errorKey = '版本验证失败';
      } else if (errorKey.includes('Worker调用失败')) {
        errorKey = 'Worker调用失败';
      }

      if (!errorGroups[errorKey]) {
        errorGroups[errorKey] = [];
      }
      errorGroups[errorKey].push(result.username);
    } else {
      // 非合并错误，正常处理
      normalResults.push(result);
    }
  });

  return { errorGroups, normalResults };
}

/**
 * 生成 Telegram 通知消息
 * @param {Object} result - Worker 返回结果
 * @returns {string} 格式化的消息
 */
function generateTelegramMessage(result) {
  const { processed, summary, results, key_usage } = result;

  let message = `🌤 *freecloud 多站点续期状态报告*\n\n`;
  message += `📊 本次处理: ${processed}个账号，本执行续期，Key使用${key_usage.this_operation}次，总计使用${key_usage.total_used}次\n`;
  message += `✅ 登录成功: ${summary.loginSuccess}个  `;
  message += `💰 续期成功: ${summary.renewSuccess}个  `;
  message += `❌ 失败: ${summary.failed}个\n\n`;

  // 分组处理错误消息
  const { errorGroups, normalResults } = groupErrorsByType(results);

  // 如果有错误，只显示错误类型和数量，不显示详细结果
  if (Object.keys(errorGroups).length > 0) {
    message += `📋 *详细结果:*\n`;
    Object.entries(errorGroups).forEach(([errorMsg, usernames]) => {
      const escapedErrorMsg = escapeMarkdown(errorMsg);
      message += `❌ ${escapedErrorMsg} \\(${usernames.length}个账号\\)\n`;
    });
  }

  // 只显示正常处理结果（验证通过的用户）
  if (normalResults.length > 0) {
    if (Object.keys(errorGroups).length === 0) {
      message += `📋 *详细结果:*\n`;
    }

    normalResults.forEach((account, index) => {
      const num = index + 1;
      const username = escapeMarkdown(account.username);
      const siteType = escapeMarkdown(account.type || 'freecloud');

      // 构建状态显示
      const loginStatus = account.loginSuccess ? '✅' : '❌';
      let statusLine = `账号${num} \`${username}\` \\(${siteType}\\) 登录: ${loginStatus}`;

      // 根据情况决定是否显示续期状态
      if (account.renewSuccess) {
        // 续期成功：显示续期状态和消息
        const renewMsg = escapeMarkdown(account.message || '续期成功');
        statusLine += `，续期: ✅，消息: ${renewMsg}`;
      } else if (account.alreadyCompleted) {
        // 已完成（如已签到）：只显示消息，不显示续期状态
        const completedMsg = escapeMarkdown(account.message || '今天已完成');
        statusLine += `，消息: ${completedMsg}`;
      } else if (account.error || account.message) {
        // 续期失败：显示续期状态和消息
        const displayMsg = account.message ? escapeMarkdown(account.message) : '处理失败';
        statusLine += `，续期: ❌，消息: ${displayMsg}`;
      } else {
        // 其他情况：显示续期失败
        statusLine += `，续期: ❌，消息: 续期失败`;
      }

      message += `${statusLine}\n`;
    });
  }

  // 添加延迟信息
  if (DELAY_SECONDS !== undefined && DELAY_TYPE !== undefined) {
    const delaySeconds = parseInt(DELAY_SECONDS) || 0;
    const delayType = escapeMarkdown(DELAY_TYPE);
    if (delaySeconds > 0) {
      const minutes = Math.floor(delaySeconds / 60);
      const seconds = delaySeconds % 60;
      message += `\n⏱️ 本次执行${delayType}: ${delaySeconds}秒 \\(${minutes}分${seconds}秒\\)\n`;
    } else {
      message += `\n⏱️ 本次执行${delayType}\n`;
    }
  }

  const currentTime = escapeMarkdown(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
  message += `⏰ 执行时间: ${currentTime}`;

  return message;
}

async function main() {
  console.log("🚀 开始执行 FreeCloud 自动续期");

  try {
    // 调用Worker处理续期
    const result = await callWorkerWithRetry(accounts, FREECLOUD_API_KEY);
    console.log(`📊 处理结果: 总计${result.processed}个账号, 登录成功${result.summary.loginSuccess}个, 续期成功${result.summary.renewSuccess}个, 失败${result.summary.failed}个，本次Key使用${result.key_usage.this_operation}次，总计使用${result.key_usage.total_used}次`);

    // 生成并发送 Telegram 通知
    const message = generateTelegramMessage(result);
    await sendTelegramMessage(message);

    // 输出详细结果
    console.log("\n📋 详细处理结果:");

    // 分组处理错误消息
    const { errorGroups, normalResults } = groupErrorsByType(result.results);

    // 如果有错误，只显示错误类型和数量
    if (Object.keys(errorGroups).length > 0) {
      Object.entries(errorGroups).forEach(([errorMsg, usernames]) => {
        console.log(`❌ ${errorMsg} (${usernames.length}个账号)`);
      });
      console.log('');
    }

    // 只显示正常的处理结果（验证通过的用户）
    if (normalResults.length > 0) {
      normalResults.forEach((account, index) => {
        const loginStatus = account.loginSuccess ? '✅' : '❌';
        let statusLine = `账号 ${index + 1}: ${account.username} 登录: ${loginStatus}`;

        // 根据情况决定是否显示续期状态
        if (account.renewSuccess) {
          // 续期成功：显示续期状态和消息
          const renewMsg = account.message || '续期成功';
          statusLine += `，续期: ✅，消息: ${renewMsg}`;
        } else if (account.alreadyCompleted) {
          // 已完成（如已签到）：只显示消息，不显示续期状态
          const completedMsg = account.message || '今天已完成';
          statusLine += `，消息: ${completedMsg}`;
        } else if (account.error || account.message) {
          // 续期失败：显示续期状态和消息
          const displayMsg = account.message || '处理失败';
          statusLine += `，续期: ❌，消息: ${displayMsg}`;
        } else {
          // 其他情况：显示续期失败
          statusLine += `，续期: ❌，消息: 续期失败`;
        }

        console.log(statusLine);
        console.log('');
      });
    }

    // 如果有失败的账号，以非零状态码退出
    if (result.summary.failed > 0) {
      console.warn(`⚠️ 有 ${result.summary.failed} 个账号处理失败`);
      process.exit(1);
    }

    console.log("🎉 所有账号处理完成");

  } catch (error) {
    console.error("❌ 执行失败:", error.message);

    // 发送错误通知
    const errorMsg = escapeMarkdown(error.message);
    const currentTime = escapeMarkdown(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
    const errorMessage = `❌ *多站点续期失败*\n\n错误信息: ${errorMsg}\n\n⏰ 时间: ${currentTime}`;
    await sendTelegramMessage(errorMessage);

    process.exit(1);
  }
}

main();
