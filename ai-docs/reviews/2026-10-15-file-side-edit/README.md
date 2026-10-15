<!--
[INPUT]: 文件侧边编辑本轮源码、实际Electron批次、原生截图与原件、官方JSON和回放。
[OUTPUT]: 选文/独立文件编辑/未知恢复的实际结果、原失败及未认证范围；不复用原主聊天编辑的成绩。
[POS]: 本轮审阅入口，唯一产品进度为第8组14。
[PROTOCOL]: 修改后同步Header和所属.folder.md。
-->
# 文件侧边编辑

文件预览提供选文快捷操作，修改要求、员工选择、真实回复和交付入口留在同一个右侧面板内。主聊天草稿和导航独立。员工仍通过已有固定来源请求/Work获取要求，原附件和旧版本保持；文件编辑记录只关联实际请求，不混入同员工其他回复。

| 批次 | 实际结果与范围 |
| --- | --- |
| [first](first-report/index.html) | 2通过、3跳过；代码选文和附件修改通过。grep误包含三个真实用例，显式真实开关未开，按跳过保留。 |
| [recovery](recovery-report/index.html) | 1失败；测试重启更换开发端口，读取了不同origin的localStorage，无法看到原待核对请求。未重复调用员工。 |
| [verified](verified-report/index.html) | 6通过、1失败；代码、附件、PDF/DOCX/XLSX/PPTX取消通过。恢复场景在同端口第二次启动等待导航时超时，实际DOM已呈现，原失败保留。 |
| [rechecked](rechecked-report/index.html) | 2通过；代码独立草稿/真实V2与未知提交重开/重启核对通过。两次启动origin相同，原requestId、hash、消息/修订和模型调用数不变，核对只读。 |

恢复修正为测试生命周期保留首次系统分配端口、冲突拒绝；启动等待实际app-shell DOM可见条件，未搬运/注入localStorage。文件内仅读取公开执行回复和已登记Work结果，私有判断/记忆及未发布草稿不再误报缺失回复；核对成功后结果保持展开。此前截图中的误报保留。

工程：相关4文件47项模块通过；曾有新测试夹具缺少完整领域字段导致类型检查失败，修正显式局部夹具断言，最终工程检查另登记。Selection Actions通过HTTPS取得并留存原始注册表、源码和hash；`shadcn view/docs/add --dry-run`出现网络断开，未成功安装。实际实现使用项目Base UI、Iconify和主题，适配上游选文操作交互，移除其演示定时器/假改写与主题依赖。

各报告逐字节校验原件和回放。前四批没有运行前完整源码/build manifest，报告明确保留该缺口；不事后伪造。真实员工批次另在启动前登记source-inputs.json，属于源码输入身份，不等同发行包/build manifest。本轮未运行全仓库、发行包或完整长时资源认证，人工视觉效果待用户审阅。

原始参考：[Selection Actions](https://www.beautifului.dev/r/selection-actions.json)，见[来源清单](upstream/source-manifest.json)。


[真实本机员工批次](real-codex-report/index.html)1场通过（约69秒），新发3条用户消息：1条原附件准备、2条明确修改，零重试。日期11-01→11-08→11-15；真实附件原件、第一版和其他段落逐字节保持，两个Work均交付。退出前/后业务状态、原件和原生整幅截图保留。登记的663项源码/入口hash在该批结束后全部一致。后续仅补文件空输入区跟随明确打开版本/重启后续改的UI，另用final-ui协议场景验证，未重跑真实模型；该差异不伪装为同次真实模型认证。

最终类型与变更renderer ESLint通过；源码构建通过，保留既有chunk大小警告。本轮未重新认证API/Claude和Word实际修改，PDF/Excel/PPT/图片实际改写也不属于本次已验证范围。当前正文仍由既有查看器呈现，本次交付是文件内让员工修改，手动正文编辑器未加入。


[最终续改UI回归](final-ui-report/index.html)2场通过：打开新版本可直接填写下一条要求；重启核对原修改后也能继续输入；核对前后没有新增业务消息、修订或模型调用。新增输入检查仅填写后清空，不执行额外员工修改。最终BDD生成和diff空白检查通过。
