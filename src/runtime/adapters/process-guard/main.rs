/*
[INPUT]: Managed native process supervisor.
[OUTPUT]: Actual cleanup exit status; faults are visible on stderr.
[POS]: CLI entry point for BOAI native subprocess ownership.
[PROTOCOL]: Update Header and .folder.md when changed.
*/
mod managed_process;
fn main() {
    match managed_process::run() {
        Ok(code) => std::process::exit(code),
        Err(error) => { eprintln!("native process cleanup: {error}"); std::process::exit(125); }
    }
}
