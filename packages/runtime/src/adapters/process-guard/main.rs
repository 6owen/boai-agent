/*
[INPUT]: Managed native process supervisor.
[OUTPUT]: Actual cleanup exit status and private PTY transport; faults are visible on stderr.
[POS]: CLI entry point for BOAI native subprocess ownership.
[PROTOCOL]: Update Header and .folder.md when changed.
*/
mod managed_process;
mod terminal;
fn main() {
    let result = if std::env::args().nth(1).as_deref() == Some("--pty") { terminal::run() } else { managed_process::run() };
    match result {
        Ok(code) => std::process::exit(code),
        Err(error) => { eprintln!("native process cleanup: {error}"); std::process::exit(125); }
    }
}
