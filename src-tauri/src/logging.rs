use std::sync::OnceLock;

fn debug_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();

    *ENABLED.get_or_init(|| {
        std::env::var("INKLING_DEBUG")
            .map(|value| {
                matches!(
                    value.trim().to_ascii_lowercase().as_str(),
                    "1" | "true" | "yes" | "on" | "debug"
                )
            })
            .unwrap_or(false)
    })
}

pub fn debug(message: impl AsRef<str>) {
    if debug_enabled() {
        eprintln!("{}", message.as_ref());
    }
}

pub fn error(message: impl AsRef<str>) {
    eprintln!("{}", message.as_ref());
}
