/*
 * [INPUT]: @boai/tokens排版定义。
 * [OUTPUT]: 保留原跨进程排版导入合同，唯一实现迁入共享包。
 * [POS]: BOAI appearance的兼容入口，不保存第二份定义。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
export * from "@boai/tokens/typography"
