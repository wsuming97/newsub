import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

/**
 * 这个脚本的目标不是“修正”ID，而是尽早发现前后端推荐列表的漂移。
 *
 * 当前项目有两套推荐源：
 * 1. 前端 RECOMMENDED_APPS：决定首页/搜索弹窗展示哪些应用
 * 2. 后端 RECOMMENDED_IDS：决定启动时尝试预热哪些真实 App Store 应用
 *
 * 一旦两边出现以下任一问题，就会再次出现“后端爬了但前端看不到”之类的链路断裂：
 * - 前端有 appStoreId，后端没有对应预热 ID
 * - 后端有预热 ID，前端列表没有对应入口
 * - 某个数字 ID 本身已经失效，iTunes Lookup 查不到
 *
 * 注意：
 * - virtual-* 属于人为定义的虚拟应用，不是 App Store 数字 ID，不参与 iTunes 校验
 * - 本脚本默认会联网校验真实 App Store ID，可用 --skip-network 跳过
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const FRONTEND_SOURCE = path.join(ROOT_DIR, 'src', 'data', 'api.js')
const BACKEND_SOURCE = path.join(ROOT_DIR, 'server', 'index.js')

const SHOULD_SKIP_NETWORK = process.argv.includes('--skip-network')
const LOOKUP_CONCURRENCY = 8

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function extractFrontendIds(source) {
  const ids = []
  const regex = /appStoreId:\s*'([^']+)'/g
  let match = regex.exec(source)
  while (match) {
    ids.push(match[1])
    match = regex.exec(source)
  }
  return ids
}

function extractBackendIds(source) {
  const blockMatch = source.match(/const RECOMMENDED_IDS = \[([\s\S]*?)\]\s*let recommendedMeta/)
  if (!blockMatch) {
    throw new Error('未找到 server/index.js 中的 RECOMMENDED_IDS 定义块')
  }

  const ids = []
  const lineRegex = /^\s*'([^']+)'\s*,?/gm
  let match = lineRegex.exec(blockMatch[1])
  while (match) {
    ids.push(match[1])
    match = lineRegex.exec(blockMatch[1])
  }
  return ids
}

function findDuplicates(ids) {
  const seen = new Set()
  const duplicates = new Set()
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id)
    seen.add(id)
  }
  return Array.from(duplicates).sort()
}

function diff(left, right) {
  const rightSet = new Set(right)
  return left.filter(item => !rightSet.has(item)).sort()
}

function splitVirtualIds(ids) {
  const virtualIds = []
  const realIds = []

  for (const id of ids) {
    if (id.startsWith('virtual-')) {
      virtualIds.push(id)
    } else {
      realIds.push(id)
    }
  }

  return {
    virtualIds: virtualIds.sort(),
    realIds: realIds.sort(),
  }
}

async function lookupAppStoreId(appStoreId) {
  const response = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(appStoreId)}`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const payload = await response.json()
  const result = Array.isArray(payload?.results) ? payload.results[0] : null

  return {
    appStoreId,
    found: Number(payload?.resultCount || 0) > 0 && !!result,
    name: result?.trackName || '',
    seller: result?.sellerName || '',
  }
}

async function lookupInBatches(ids, concurrency = LOOKUP_CONCURRENCY) {
  const results = []

  for (let index = 0; index < ids.length; index += concurrency) {
    const batch = ids.slice(index, index + concurrency)
    const batchResults = await Promise.all(
      batch.map(async id => {
        try {
          return await lookupAppStoreId(id)
        } catch (error) {
          return {
            appStoreId: id,
            found: false,
            name: '',
            seller: '',
            error: error.message,
          }
        }
      })
    )
    results.push(...batchResults)
  }

  return results
}

function printSection(title, lines) {
  console.log(`\n[${title}]`)
  if (!lines.length) {
    console.log('无')
    return
  }

  for (const line of lines) {
    console.log(`- ${line}`)
  }
}

async function main() {
  const frontendSource = readUtf8(FRONTEND_SOURCE)
  const backendSource = readUtf8(BACKEND_SOURCE)

  const frontendIds = extractFrontendIds(frontendSource)
  const backendIds = extractBackendIds(backendSource)
  const { virtualIds, realIds: frontendRealIds } = splitVirtualIds(frontendIds)

  const frontendDuplicates = findDuplicates(frontendIds)
  const backendDuplicates = findDuplicates(backendIds)
  const frontendOnly = diff(frontendRealIds, backendIds)
  const backendOnly = diff(backendIds, frontendRealIds)

  console.log('Youhu 推荐 ID 一致性校验')
  console.log(`- 前端推荐总数: ${frontendIds.length}`)
  console.log(`- 前端虚拟应用数: ${virtualIds.length}`)
  console.log(`- 前端真实 App Store ID 数: ${frontendRealIds.length}`)
  console.log(`- 后端预热 ID 数: ${backendIds.length}`)

  printSection('前端重复 ID', frontendDuplicates)
  printSection('后端重复 ID', backendDuplicates)
  printSection('前端存在但后端缺失的真实 ID', frontendOnly)
  printSection('后端存在但前端缺失的 ID', backendOnly)
  printSection('前端虚拟应用 ID（已跳过 iTunes 校验）', virtualIds)

  let invalidIds = []
  if (!SHOULD_SKIP_NETWORK) {
    console.log('\n[联网校验] 正在通过 iTunes Lookup 校验真实 App Store ID ...')
    const lookupResults = await lookupInBatches(backendIds)
    invalidIds = lookupResults
      .filter(item => !item.found)
      .map(item => item.error ? `${item.appStoreId} (${item.error})` : item.appStoreId)
      .sort()

    const sampleValid = lookupResults
      .filter(item => item.found)
      .slice(0, 5)
      .map(item => `${item.appStoreId} -> ${item.name || '未知应用'}`)

    printSection('iTunes Lookup 无法找到的 ID', invalidIds)
    printSection('iTunes Lookup 样例命中', sampleValid)
  } else {
    console.log('\n[联网校验] 已按 --skip-network 跳过')
  }

  const hasMismatch =
    frontendDuplicates.length > 0 ||
    backendDuplicates.length > 0 ||
    frontendOnly.length > 0 ||
    backendOnly.length > 0 ||
    invalidIds.length > 0

  if (hasMismatch) {
    console.error('\n校验失败：检测到推荐 ID 漂移或无效 ID，请先修复后再部署。')
    process.exitCode = 1
    return
  }

  console.log('\n校验通过：前后端推荐 ID 一致，且真实 App Store ID 可达。')
}

main().catch(error => {
  console.error(`\n校验脚本执行失败: ${error.message}`)
  process.exitCode = 1
})
