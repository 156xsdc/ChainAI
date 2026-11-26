// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// 读取文本文件（导入用）
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 目录项（批量导入时需要知道有哪些文件）
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DirEntryInfo {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

/// 列出目录内容（按名称排序）
#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntryInfo>, String> {
    let iter = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for entry in iter.flatten() {
        let p = entry.path();
        let meta = entry.metadata().ok();
        out.push(DirEntryInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            path: p.to_string_lossy().to_string(),
            is_dir: meta.as_ref().map(|m| m.is_dir()).unwrap_or(false),
            size: meta.map(|m| m.len()).unwrap_or(0),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// 复制文件（一次性数据迁移用；目标已存在则视为成功，幂等）
#[tauri::command]
fn copy_file(src: String, dst: String) -> Result<(), String> {
    if std::path::Path::new(&dst).exists() {
        return Ok(());
    }
    if let Some(parent) = std::path::Path::new(&dst).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&src, &dst).map_err(|e| e.to_string())?;
    Ok(())
}

/// 应用数据目录：
/// - Windows 安装版（release）：可执行文件所在目录（安装路径，数据随程序走）
/// - 其他情况（macOS/Linux 全部 + 任意平台的 debug）：系统应用数据目录
///
/// macOS 特殊说明：`.app` 包内是签名保护区域，安装/升级会整包替换，
/// 把数据放在 `Contents/MacOS/` 下等于每次升级必丢，因此统一走
/// `~/Library/Application Support/<identifier>/`。
#[tauri::command]
fn app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(windows)]
    if !cfg!(debug_assertions) {
        return std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
            .map(|d| d.to_string_lossy().to_string())
            .ok_or_else(|| "无法确定可执行文件目录".to_string());
    }
    app.path()
        .app_config_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// 空库体积阈值：只有建表语句、没有任何对话的库约 4KB
const EMPTY_DB_BYTES: u64 = 12 * 1024;

#[derive(serde::Serialize, Default)]
struct LegacyDbCandidate {
    name: String,
    bytes: u64,
}

#[derive(serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct LegacyDbMigration {
    target: String,
    migrated_from: Option<String>,
    skipped: Option<String>,
    candidates: Vec<LegacyDbCandidate>,
}

fn with_suffix(path: &std::path::Path, suffix: &str) -> std::path::PathBuf {
    std::path::PathBuf::from(format!("{}{}", path.to_string_lossy(), suffix))
}

/// 历史遗留数据库整理（幂等，可重复执行）
///
/// 背景：早期前端 `joinPath()` 在所有平台都用 `\` 拼接，macOS 上把
/// `/Applications/x` 拼成 `\Applications\x`（相对路径），于是每个启动位置都会
/// 生成一个「文件名带反斜杠」的独立数据库。用户感知就是「升级后聊天记录没了」。
///
/// 这里把这些散落库统一收敛到 `dir/chainai.db`：挑主库文件最大的那个
/// （WAL 大小无法区分空库，故只用主库体积排序），复制前先备份到
/// `dir/legacy-db-backup/`，不删除任何历史文件。
#[tauri::command]
fn migrate_legacy_dbs(dir: String) -> Result<LegacyDbMigration, String> {
    let dir_path = std::path::PathBuf::from(&dir);
    std::fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;

    let target = dir_path.join("chainai.db");
    let mut report = LegacyDbMigration {
        target: target.to_string_lossy().to_string(),
        ..Default::default()
    };

    // 收集候选：文件名含反斜杠的 chainai.db（老 joinPath 在 POSIX 上的产物）
    let mut candidates: Vec<(String, std::path::PathBuf, u64)> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.contains('\\') && name.ends_with("chainai.db") {
                let bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                candidates.push((name, path, bytes));
            }
        }
    }
    candidates.sort_by(|a, b| b.2.cmp(&a.2));
    report.candidates = candidates
        .iter()
        .map(|(name, _, bytes)| LegacyDbCandidate {
            name: name.clone(),
            bytes: *bytes,
        })
        .collect();

    if candidates.is_empty() {
        return Ok(report);
    }

    let target_bytes = std::fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
    if target_bytes > EMPTY_DB_BYTES {
        report.skipped = Some("目标数据库已有数据，跳过迁移".to_string());
        return Ok(report);
    }

    let (best_name, best_path, best_bytes) = &candidates[0];
    if *best_bytes <= EMPTY_DB_BYTES {
        report.skipped = Some("历史库均为空库，跳过迁移".to_string());
        return Ok(report);
    }

    // 先备份，再落地（幂等：重复执行时目标已有数据会直接跳过）
    let backup_dir = dir_path.join("legacy-db-backup");
    std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let sanitized = best_name.replace('\\', "_").replace('/', "_");
    std::fs::copy(best_path, backup_dir.join(&sanitized)).map_err(|e| e.to_string())?;
    if target.exists() {
        let _ = std::fs::copy(&target, backup_dir.join("previous-empty-chainai.db"));
    }

    std::fs::copy(best_path, &target).map_err(|e| e.to_string())?;
    // 未 checkpoint 的数据在 WAL 里，必须一起搬；旧的 -shm 会干扰 WAL 重放，删掉
    let src_wal = with_suffix(best_path, "-wal");
    let _ = std::fs::remove_file(with_suffix(&target, "-shm"));
    if std::fs::metadata(&src_wal).map(|m| m.len() > 0).unwrap_or(false) {
        std::fs::copy(&src_wal, with_suffix(&target, "-wal")).map_err(|e| e.to_string())?;
    }

    report.migrated_from = Some(best_name.clone());
    Ok(report)
}

/// 写入文本文件（导出/便签用；自动创建父目录）
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// 删除文件（便签删除用）
#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    if std::path::Path::new(&path).exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 追加文本到文件（错误日志用）
#[tauri::command]
fn append_text_file(path: String, content: String) -> Result<(), String> {
    use std::io::Write;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    f.write_all(content.as_bytes()).map_err(|e| e.to_string())
}

/// 写入二进制文件（PNG 导出用，base64 传入）
#[tauri::command]
fn write_binary_file(path: String, base64_content: String) -> Result<(), String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    let bytes = STANDARD
        .decode(base64_content)
        .map_err(|e| e.to_string())?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            read_text_file,
            list_dir,
            write_text_file,
            append_text_file,
            delete_file,
            write_binary_file,
            copy_file,
            app_data_dir,
            migrate_legacy_dbs
        ])
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // 防止误触关闭：点击关闭按钮时隐藏到托盘，而非退出
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // macOS：应用「没有可见窗口」时点 Dock 图标 / 从启动器重新激活，
            // 系统发的是 Reopen 事件而不是新建窗口。不处理的话表现就是
            // 「最小化或关闭到托盘久了，再点图标没反应、打不开」。
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
}

/// 系统托盘：显示主窗口 / 退出
fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show_i = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().expect("no window icon").clone())
        .tooltip("通途 · 树状对话")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // 左键单击托盘图标：显示并聚焦主窗口
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;
    Ok(())
}
