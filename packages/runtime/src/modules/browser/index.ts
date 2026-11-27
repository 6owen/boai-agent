/*
 * [INPUT]: The embedded browser command parser, single-command executor and main-process capabilities.
 * [OUTPUT]: Host entry for the fixed page measurement, validated command and pane types.
 * [POS]: Public @boai/runtime/browser boundary. Other command helpers are internal to the runtime.
 * [PROTOCOL]: Update this header and the browser directory map when changing exports.
 */
export { BROWSER_PAGE_METRICS_EXPRESSION, executeBrowserSingleCommand, parseBrowserSingleCommand } from './commands'
export type { BrowserClickResult, BrowserPaneFns } from './pane-types'
