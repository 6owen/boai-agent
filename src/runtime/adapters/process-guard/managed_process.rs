/*
[INPUT]: Rovai identity-bound ProcessTree modules, actual CLI and private owner ledger.
[OUTPUT]: Native stdio/cleanup plus private desktop lifetime observation; only a confirmed dead root permits descendant cleanup.
[POS]: Minimal native supervisor; no model, product data or second employee/task authority.
[PROTOCOL]: Update .folder.md, build integration and migration manifest when changed.
*/
use std::{env, io::{self, Read, Write}, path::Path, process::{Command, Stdio}, sync::atomic::{AtomicBool, Ordering}, thread, time::Duration};
use std::os::unix::process::CommandExt;
#[cfg(target_os="macos")]
#[path="macos.rs"] mod process_tree;
#[cfg(target_os="linux")]
#[path="linux.rs"] mod process_tree;
static STOP: AtomicBool = AtomicBool::new(false);
extern "C" fn stopping(_: i32) { STOP.store(true, Ordering::SeqCst); }
pub(crate) fn run() -> io::Result<i32> {
    let args: Vec<_> = env::args().skip(1).collect();
    if args.len() == 2 && args[0] == "--watch-desktop" {
        let pid = args[1].parse::<i32>().map_err(|_| io::Error::other("invalid desktop PID"))?;
        return watch_desktop(pid);
    }
    if args.len() == 2 && args[0] == "--recover" {
        #[cfg(target_os="macos")] process_tree::recover(Path::new(&args[1]))?;
        return Ok(0);
    }
    if args.len() < 3 || args[0] != "--ledger" { return Err(io::Error::other("expected --ledger DIR COMMAND [ARGS]")); }
    let ledger = Path::new(&args[1]);
    #[cfg(target_os="macos")] process_tree::recover(ledger)?;
    unsafe { libc::signal(libc::SIGTERM, stopping as *const () as libc::sighandler_t); libc::signal(libc::SIGINT, stopping as *const () as libc::sighandler_t); }
    let owner = unsafe { libc::getppid() };
    let mut child = Command::new(&args[2]).args(&args[3..]).stdin(Stdio::inherit()).stdout(Stdio::inherit()).stderr(Stdio::inherit()).process_group(0).spawn()?;
    let mut tree = match process_tree::ProcessTree::new(child.id() as i32) {
        Ok(tree) => tree,
        Err(error) => { let _ = child.kill(); let _ = child.wait(); return Err(error); }
    };
    let mut status = None;
    let mut fault = None;
    #[cfg(target_os="macos")] if let Err(error) = tree.track(ledger) { fault = Some(error); }
    loop {
        if fault.is_some() { break; }
        if let Err(error) = tree.capture() { fault = Some(error); break; }
        status = match child.try_wait() { Ok(status) => status, Err(error) => { fault = Some(error); break; } };
        if status.is_some() || STOP.load(Ordering::SeqCst) || unsafe { libc::getppid() } != owner { break; }
        thread::sleep(Duration::from_millis(40));
    }
    // Same ordering as Rovai: preserve descendant identities before severing ancestry.
    // Keep the supervisor alive until the captured tree has actually stopped.
    loop {
        if let Err(error) = tree.capture() { fault.get_or_insert(error); }
        if let Err(error) = tree.signal(libc::SIGKILL) { fault.get_or_insert(error); }
        let _ = child.try_wait();
        match tree.is_empty() {
            Ok(true) => break,
            Ok(false) => {},
            Err(error) => { fault.get_or_insert(error); }
        }
        thread::sleep(Duration::from_millis(20));
    }
    let exit = child.wait()?;
    #[cfg(target_os="macos")] tree.retire()?;
    if let Some(error) = fault { return Err(error); }
    Ok(status.unwrap_or(exit).code().unwrap_or(130))
}

fn watch_desktop(pid: i32) -> io::Result<i32> {
    let mut tree = process_tree::ProcessTree::observe(pid)?;
    tree.capture()?;
    // Closing the service's pipe stops observation only; never kill a live desktop.
    thread::spawn(|| { let mut bytes = [0_u8; 1]; let _ = io::stdin().read(&mut bytes); STOP.store(true, Ordering::SeqCst); });
    println!("{{\"type\":\"ready\",\"pid\":{pid}}}"); io::stdout().flush()?;
    loop {
        if STOP.load(Ordering::SeqCst) { return Ok(0); }
        tree.capture()?;
        if !tree.root_alive()? { break; }
        thread::sleep(Duration::from_millis(100));
    }
    // Root lifetime ended. Reuse audited signals/pidfds for captured Chromium
    // descendants, never a recycled PID, and retain observation until actual exit.
    loop {
        if STOP.load(Ordering::SeqCst) { return Ok(0); }
        tree.capture()?;
        tree.signal(libc::SIGKILL)?;
        if tree.is_empty()? { break; }
        thread::sleep(Duration::from_millis(20));
    }
    println!("{{\"type\":\"exited\",\"pid\":{pid}}}"); io::stdout().flush()?;
    Ok(0)
}
