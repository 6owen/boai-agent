/*
[INPUT]: Host-validated directory/shell, optional interactive login mode and bounded JSON input.
[OUTPUT]: Bounded PTY read batches keep control responsive; stdin EOF leaves ancestry intact for outer cleanup.
[POS]: Private --pty mode, always launched beneath the normal identity-bound guard.
[PROTOCOL]: Update Header and .folder.md when changed.
*/
use std::{env, fs::File, io::{self, BufRead, Read, Write}, os::fd::{FromRawFd, RawFd}, os::unix::process::{CommandExt, ExitStatusExt}, process::{Command, Stdio}, sync::mpsc, thread, time::Duration};
use serde_json::{json, Value};
use std::collections::VecDeque;

fn emit(value: Value) -> io::Result<()> {
    let mut out = io::stdout().lock();
    serde_json::to_writer(&mut out, &value)?;
    out.write_all(b"\n")?;
    out.flush()
}
pub(crate) fn run() -> io::Result<i32> {
    let args: Vec<_> = env::args().skip(2).collect();
    if args.len() < 2 || args.len() > 3 || (args.len() == 3 && args[2] != "--login") { return Err(io::Error::other("expected --pty CWD SHELL [--login]")); }
    let (mut master, mut slave): (RawFd, RawFd) = (-1, -1);
    let mut size = libc::winsize { ws_row: 30, ws_col: 100, ws_xpixel: 0, ws_ypixel: 0 };
    if unsafe { libc::openpty(&mut master, &mut slave, std::ptr::null_mut(), std::ptr::null_mut(), &mut size) } != 0 { return Err(io::Error::last_os_error()); }
    let mut reader = unsafe { File::from_raw_fd(master) };
    let slave_file = unsafe { File::from_raw_fd(slave) };
    unsafe {
        libc::fcntl(master, libc::F_SETFD, libc::FD_CLOEXEC);
        libc::fcntl(master, libc::F_SETFL, libc::O_NONBLOCK);
    }
    let mut cmd = Command::new(&args[1]);
    cmd.arg(if args.len() == 3 { "-il" } else { "-i" }).current_dir(&args[0])
        .stdin(Stdio::from(slave_file.try_clone()?))
        .stdout(Stdio::from(slave_file.try_clone()?))
        .stderr(Stdio::from(slave_file));
    unsafe {
        cmd.pre_exec(|| {
            if libc::setsid() < 0 || libc::ioctl(0, libc::TIOCSCTTY as _, 0) < 0 { return Err(io::Error::last_os_error()); }
            Ok(())
        });
    }
    let mut child = cmd.spawn()?;
    emit(json!({"type":"ready","pid":child.id()}))?;
    let (send, receive) = mpsc::sync_channel(64);
    thread::spawn(move || {
        for line in io::stdin().lock().lines() {
            match line {
                Ok(line) if line.len() <= 262144 => {
                    if send.send(serde_json::from_str::<Value>(&line).ok()).is_err() { return; }
                }
                _ => break,
            }
        }
        let _ = send.send(None);
    });
    let mut bytes = [0_u8; 8192];
    let mut pending = VecDeque::<u8>::new();
    loop {
        for input in receive.try_iter() {
            // The outer owner handles cancellation/parent loss after capturing the
            // tree. Killing the shell here would sever ancestry before that capture.
            let Some(input) = input else { continue; };
            if let Some(data) = input.get("data").and_then(Value::as_str) {
                if pending.len() + data.len() > 262144 { return Err(io::Error::other("PTY input queue is full")); }
                pending.extend(data.as_bytes());
            }
            if let (Some(cols), Some(rows)) = (input.get("cols").and_then(Value::as_u64), input.get("rows").and_then(Value::as_u64)) {
                let size = libc::winsize { ws_row: rows.clamp(2, 300) as _, ws_col: cols.clamp(10, 500) as _, ws_xpixel: 0, ws_ypixel: 0 };
                if unsafe { libc::ioctl(master, libc::TIOCSWINSZ as _, &size) } < 0 { return Err(io::Error::last_os_error()); }
            }
        }
        while !pending.is_empty() {
            match reader.write(pending.make_contiguous()) {
                Ok(0) => return Err(io::Error::other("PTY input closed")),
                Ok(n) => { pending.drain(..n); },
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => break,
                Err(error) => return Err(error),
            }
        }
        // A continuously writable program (for example `yes`) must not starve
        // the next stdin/control pass. The pipe itself supplies output backpressure.
        for _ in 0..32 {
            match reader.read(&mut bytes) {
                Ok(0) => break,
                Ok(n) => emit(json!({"type":"data","bytes":&bytes[..n]}))?,
                Err(error) if error.kind() == io::ErrorKind::WouldBlock || error.raw_os_error() == Some(libc::EIO) => break,
                Err(error) => return Err(error),
            }
        }
        if let Some(status) = child.try_wait()? {
            let code = status.code().unwrap_or(128 + status.signal().unwrap_or(1));
            emit(json!({"type":"exit","code":code}))?;
            return Ok(code);
        }
        thread::sleep(Duration::from_millis(8));
    }
}
