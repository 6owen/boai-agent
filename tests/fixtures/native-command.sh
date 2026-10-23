# [INPUT]: 明确批准的隔离任务工作目录；仅供本机命令生命周期验收。
# [OUTPUT]: 父/子PID与持续写入标记；子进程关闭输出管道，停止必须终止继承进程组。
# [POS]: 离线协议与真实Codex共同使用的可审阅命令，不访问工作目录之外的文件。
# [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
printf '%s' "$$" > command-parent.pid
sh -c 'printf "%s" "$$" > command-child.pid; while :; do printf "tick\n" >> command-ticks.txt; sleep 1; done' </dev/null >/dev/null 2>&1 &
while [ ! -s command-child.pid ]; do sleep 0.01; done
wait
