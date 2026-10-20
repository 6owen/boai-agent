/*
 * [INPUT]: 冻结必需测试名称及Vitest/Playwright原始JSON。
 * [OUTPUT]: 区分实际失败与未完整执行；缺失、跳过、重复、重试和全局错误不能用于开发基线。
 * [POS]: 开发控制器报告核验，不执行测试或修改验收合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
export function inspectRequiredTests(report: unknown, required: string[], format: 'vitest' | 'playwright' = 'vitest') {
  const tests: { name: string; available: boolean; passed: boolean }[] = []
  try {
    if (!object(report)) throw new Error('缺少报告对象')
    if (format === 'vitest') {
      if (!Array.isArray(report.testResults) || report.numRuntimeErrorTestSuites !== undefined && report.numRuntimeErrorTestSuites !== 0) throw new Error('Vitest报告不完整')
      for (const file of report.testResults) {
        if (!object(file) || !Array.isArray(file.assertionResults)) throw new Error('缺少断言结果')
        for (const item of file.assertionResults) {
          if (!object(item) || typeof item.fullName !== 'string' || typeof item.status !== 'string') throw new Error('断言格式不完整')
          tests.push({ name: item.fullName, available: ['passed', 'failed'].includes(item.status), passed: item.status === 'passed' })
        }
      }
    } else {
      if (report.errors !== undefined && (!Array.isArray(report.errors) || report.errors.length)) throw new Error('Playwright全局执行错误')
      const walk = (suites: unknown) => {
        if (!Array.isArray(suites)) throw new Error('缺少场景结果')
        for (const suite of suites) {
          if (!object(suite)) throw new Error('场景格式不完整')
          const specs = suite.specs ?? []
          if (!Array.isArray(specs)) throw new Error('场景格式不完整')
          for (const spec of specs) {
            if (!object(spec) || typeof spec.title !== 'string' || !Array.isArray(spec.tests)) throw new Error('缺少测试结果')
            for (const test of spec.tests) {
              if (!object(test) || !Array.isArray(test.results)) throw new Error('测试格式不完整')
              const result = test.results[0], status = object(result) ? result.status : undefined
              const available = test.expectedStatus === 'passed' && test.results.length === 1 && ['passed', 'failed', 'timedOut'].includes(String(status))
              tests.push({ name: spec.title, available, passed: available && test.status === 'expected' && status === 'passed' })
            }
          }
          walk(suite.suites ?? [])
        }
      }
      walk(report.suites)
    }
    const available = required.length > 0 && required.every(name => { const found = tests.filter(test => test.name === name); return found.length === 1 && found[0].available })
    return { available, passed: available && required.every(name => tests.find(test => test.name === name)!.passed) }
  } catch { return { available: false, passed: false } }
}
