# [INPUT]: 明确批准的本次任务目录和验收控制器在来源故障后写入的 command-release 标记。
# [OUTPUT]: 父子PID、计数和一次自然结束记录；不访问本目录之外的文件。
# [POS]: 已开始命令期间材料原件失效的离线/真实共用命令，不把完成命令当业务交付。
# [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
printf '%s' "$$" > command-parent.pid
sh -c 'printf "%s" "$$" > command-child.pid; while [ ! -f command-release ]; do printf "tick\n" >> command-ticks.txt; sleep 0.1; done' </dev/null >/dev/null 2>&1 &
while [ ! -s command-child.pid ]; do sleep 0.01; done
wait
printf 'finished-once\n' >> command-finished.txt
