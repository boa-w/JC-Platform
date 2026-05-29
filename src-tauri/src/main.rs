/// 应用程序入口。
///
/// 调用 lib crate 中的 `run()` 启动 Tauri 运行时，
/// 桌面端与移动端共用同一套业务逻辑。
fn main() {
    jc_custom_platform_tauri_lib::run();
}
