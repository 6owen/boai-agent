/*
 * [INPUT]: 场景内 HTTP 响应服务器；生产 worker 的 fetch、DNS 与 HTTPS 请求。
 * [OUTPUT]: 仅在独立测试进程重定向获准 fixture 主机的网络传输；所有产品 IPC/扫描/安装/更新逻辑保持实际实现。
 * [POS]: 原生 Skills 桌面验收的网络边界替身；不进入生产构建。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import dns from 'node:dns/promises'
import https from 'node:https'
import http from 'node:http'
import { syncBuiltinESMExports } from 'node:module'

export function installNativeSkillNetwork(endpoint) {
  const hosts = new Set(['skills.sh', 'clawhub.ai', 'api.skillhub.cn', 'native-fixture.example', 'private-fixture.example'])
  const destination = input => {
    const url = new URL(input)
    if (url.protocol !== 'https:' || !hosts.has(url.hostname)) throw new Error(`Unexpected test network request: ${url.origin}`)
    const target = new URL(endpoint); target.searchParams.set('target', url.href); return target
  }
  dns.lookup = async (hostname, options) => {
    if (!hosts.has(hostname)) throw new Error(`Unexpected test DNS request: ${hostname}`)
    const record = { address: hostname === 'private-fixture.example' ? '127.0.0.1' : '93.184.216.34', family: 4 }
    return options?.all ? [record] : record
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = (input, options) => originalFetch(destination(typeof input === 'string' || input instanceof URL ? input : input.url), options)
  https.request = (url, options, callback) => {
    const { lookup: _lookup, family: _family, ...forward } = options
    return http.request(destination(url), forward, callback)
  }
  syncBuiltinESMExports()
}
