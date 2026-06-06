//! 命令行入口。
//!
//! CLI 覆盖可脱离桌面 UI 使用的 Tauri 命令，输出统一为 JSON，便于脚本集成。

use crate::commands::{self, LegacyTableKind, UiResourceParseRequest};
use crate::domain::export::{BinaryCompareRequest, ExportPlanRequest};
use crate::domain::project::{NewProjectRequest, SaveProjectAsRequest, SaveProjectRequest};
use crate::domain::ui_resource::{
    UiResourceOptionAddRequest, UiResourceOptionRemoveRequest, UiResourceUpdateRequest,
};
use crate::infrastructure::csv_excel::{ExportTableRequest, TableFileRequest};
use clap::{Parser, Subcommand, ValueEnum};
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use std::fmt;
use std::fs;
use std::io::Read;

#[derive(Debug, Parser)]
#[command(name = "jc-cli", version, about = "自定义开发平台命令行工具")]
struct Cli {
    /// Pretty-print JSON output.
    #[arg(long, global = true)]
    pretty: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// Print backend health, version, and build metadata.
    Health,
    /// Project file lifecycle commands.
    Project {
        #[command(subcommand)]
        command: ProjectCommand,
    },
    /// UI resource parsing and document transforms.
    Ui {
        #[command(subcommand)]
        command: UiCommand,
    },
    /// Legacy table import/export commands.
    Table {
        #[command(subcommand)]
        command: TableCommand,
    },
    /// PDO commands.
    Pdo {
        #[command(subcommand)]
        command: PdoCommand,
    },
    /// Project package export commands.
    Export {
        #[command(subcommand)]
        command: ExportCommand,
    },
    /// Project binary build and compare commands.
    Binary {
        #[command(subcommand)]
        command: BinaryCommand,
    },
}

#[derive(Debug, Subcommand)]
enum ProjectCommand {
    /// Print the default empty project summary.
    Summary,
    /// Load a .jcpro project file.
    Load { path: String },
    /// Create a new .jcpro project file.
    Create {
        #[arg(long)]
        path: String,
        #[arg(long)]
        name: String,
        #[arg(long = "resolution-w")]
        resolution_w: u32,
        #[arg(long = "resolution-h")]
        resolution_h: u32,
    },
    /// Save a project document to a path.
    Save {
        #[arg(long)]
        path: String,
        #[arg(long)]
        document: String,
    },
    /// Save a project document to a new path and copy referenced resources.
    SaveAs {
        #[arg(long = "source-path")]
        source_path: String,
        #[arg(long = "target-path")]
        target_path: String,
        #[arg(long)]
        document: String,
    },
    /// Validate a project document.
    Validate {
        #[arg(long)]
        document: String,
    },
    /// Migrate a project document and print the migrated result.
    MigrateDocument {
        #[arg(long)]
        document: String,
    },
    /// Migrate a project file in place.
    MigrateFile { path: String },
    /// Parse a project document.
    ParseDocument {
        #[arg(long)]
        document: String,
    },
    /// Parse a project file.
    ParseFile { path: String },
}

#[derive(Debug, Subcommand)]
enum UiCommand {
    /// Parse UI resources from a project document.
    Parse {
        #[arg(long)]
        document: String,
        #[arg(long)]
        project_path: Option<String>,
    },
    /// Parse UI resources from a project file.
    ParseFile { path: String },
    /// Update a UI resource position, size, and default option.
    Update {
        #[arg(long)]
        document: String,
        #[arg(long)]
        key: String,
        #[arg(long)]
        x: i32,
        #[arg(long)]
        y: i32,
        #[arg(long)]
        width: u32,
        #[arg(long)]
        height: u32,
        #[arg(long = "default-option")]
        default_option: usize,
    },
    /// Add one or more source paths as an option for a UI resource.
    AddOption {
        #[arg(long)]
        document: String,
        #[arg(long)]
        key: String,
        #[arg(long = "source", required = true)]
        sources: Vec<String>,
    },
    /// Remove a UI resource option by index.
    RemoveOption {
        #[arg(long)]
        document: String,
        #[arg(long)]
        key: String,
        #[arg(long = "option-index")]
        option_index: usize,
    },
}

#[derive(Debug, Subcommand)]
enum TableCommand {
    /// Print standard table headers for a table kind.
    Spec { kind: CliTableKind },
    /// Validate headers for a table kind.
    ValidateHeaders {
        kind: CliTableKind,
        #[arg(long = "header", required = true)]
        headers: Vec<String>,
    },
    /// Import table data from JSON, CSV, or workbook files.
    Import {
        #[command(subcommand)]
        command: TableImportCommand,
    },
    /// Export a table document to CSV.
    ExportCsv {
        #[arg(long)]
        path: String,
        #[arg(long)]
        table: String,
    },
    /// Export a table document to an Excel XML workbook.
    ExportWorkbook {
        #[arg(long)]
        path: String,
        #[arg(long)]
        table: String,
    },
    /// Build a table from a language document.
    FromLanguageDocument {
        #[arg(long)]
        document: String,
    },
    /// Build a table from a PDO simple document.
    FromPdoSimpleDocument {
        #[arg(long)]
        document: String,
    },
    /// Build a table from an SDO document.
    FromSdoDocument {
        #[arg(long)]
        document: String,
    },
}

#[derive(Debug, Subcommand)]
enum TableImportCommand {
    Sdo {
        #[arg(long)]
        table: String,
    },
    SdoCsv {
        path: String,
    },
    SdoWorkbook {
        path: String,
    },
    PdoSimple {
        #[arg(long)]
        table: String,
    },
    PdoSimpleCsv {
        path: String,
    },
    PdoSimpleWorkbook {
        path: String,
    },
    Language {
        #[arg(long)]
        table: String,
    },
    LanguageCsv {
        path: String,
    },
    LanguageWorkbook {
        path: String,
    },
}

#[derive(Clone, Copy, Debug, ValueEnum)]
#[value(rename_all = "kebab-case")]
enum CliTableKind {
    Sdo,
    PdoSimple,
    Language,
}

#[derive(Debug, Subcommand)]
enum PdoCommand {
    Advanced {
        #[command(subcommand)]
        command: PdoAdvancedCommand,
    },
}

#[derive(Debug, Subcommand)]
enum PdoAdvancedCommand {
    /// Parse advanced PDO data from a project document.
    Parse {
        #[arg(long)]
        document: String,
    },
    /// Parse advanced PDO data from a project file.
    ParseFile { path: String },
}

#[derive(Debug, Subcommand)]
enum ExportCommand {
    /// Build an export plan without writing export artifacts.
    Plan {
        #[arg(long)]
        document: String,
        #[arg(long = "output-dir")]
        output_dir: String,
        #[arg(long)]
        project_path: Option<String>,
    },
    /// Export the full project package.
    Package {
        #[arg(long)]
        document: String,
        #[arg(long = "output-dir")]
        output_dir: String,
        #[arg(long)]
        project_path: Option<String>,
    },
    /// Copy UI images for a project export.
    CopyUiImages {
        #[arg(long)]
        document: String,
        #[arg(long = "output-dir")]
        output_dir: String,
        #[arg(long)]
        project_path: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
enum BinaryCommand {
    /// Build project binary data from a document.
    Build {
        #[arg(long)]
        document: String,
        #[arg(long = "write-bytes")]
        write_bytes: Option<String>,
    },
    /// Compare generated project binary data with an existing binary file.
    Compare {
        #[arg(long)]
        document: String,
        #[arg(long = "legacy-binary-path")]
        legacy_binary_path: String,
    },
}

#[derive(Debug, Serialize)]
struct OkResponse {
    ok: bool,
}

#[derive(Debug)]
enum CliError {
    Io(std::io::Error),
    Json(serde_json::Error),
    Backend(String),
    Output(serde_json::Error),
}

impl fmt::Display for CliError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CliError::Io(error) => write!(formatter, "{error}"),
            CliError::Json(error) => write!(formatter, "{error}"),
            CliError::Backend(error) => write!(formatter, "{error}"),
            CliError::Output(error) => write!(formatter, "{error}"),
        }
    }
}

impl From<std::io::Error> for CliError {
    fn from(error: std::io::Error) -> Self {
        CliError::Io(error)
    }
}

impl From<serde_json::Error> for CliError {
    fn from(error: serde_json::Error) -> Self {
        CliError::Json(error)
    }
}

/// 运行 CLI，返回进程退出码。
pub fn run() -> i32 {
    match run_inner() {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("{}", serde_json::json!({ "error": error.to_string() }));
            1
        }
    }
}

fn run_inner() -> Result<(), CliError> {
    let cli = Cli::parse();
    dispatch(cli.command, cli.pretty)
}

fn dispatch(command: Commands, pretty: bool) -> Result<(), CliError> {
    match command {
        Commands::Health => print_json(&commands::backend_health(), pretty),
        Commands::Project { command } => run_project(command, pretty),
        Commands::Ui { command } => run_ui(command, pretty),
        Commands::Table { command } => run_table(command, pretty),
        Commands::Pdo { command } => run_pdo(command, pretty),
        Commands::Export { command } => run_export(command, pretty),
        Commands::Binary { command } => run_binary(command, pretty),
    }
}

fn run_project(command: ProjectCommand, pretty: bool) -> Result<(), CliError> {
    match command {
        ProjectCommand::Summary => print_json(&commands::project_summary(), pretty),
        ProjectCommand::Load { path } => print_backend(commands::load_project(path), pretty),
        ProjectCommand::Create {
            path,
            name,
            resolution_w,
            resolution_h,
        } => print_backend(
            commands::create_project(NewProjectRequest {
                path,
                name,
                resolution_w,
                resolution_h,
            }),
            pretty,
        ),
        ProjectCommand::Save { path, document } => print_backend(
            commands::save_project(SaveProjectRequest {
                path,
                document: read_json_value(&document)?,
            }),
            pretty,
        ),
        ProjectCommand::SaveAs {
            source_path,
            target_path,
            document,
        } => print_backend(
            commands::save_project_as(SaveProjectAsRequest {
                source_path,
                target_path,
                document: read_json_value(&document)?,
            }),
            pretty,
        ),
        ProjectCommand::Validate { document } => print_json(
            &commands::validate_project_document(read_json_value(&document)?),
            pretty,
        ),
        ProjectCommand::MigrateDocument { document } => print_json(
            &commands::migrate_project_document(read_json_value(&document)?),
            pretty,
        ),
        ProjectCommand::MigrateFile { path } => {
            print_backend(commands::migrate_project_file(path), pretty)
        }
        ProjectCommand::ParseDocument { document } => print_json(
            &commands::parse_project_document(read_json_value(&document)?),
            pretty,
        ),
        ProjectCommand::ParseFile { path } => {
            print_backend(commands::parse_project_file(path), pretty)
        }
    }
}

fn run_ui(command: UiCommand, pretty: bool) -> Result<(), CliError> {
    match command {
        UiCommand::Parse {
            document,
            project_path,
        } => {
            let document = read_json_value(&document)?;
            if project_path.is_some() {
                print_json(
                    &commands::parse_ui_resources_with_project_path(UiResourceParseRequest {
                        project_path,
                        document,
                    }),
                    pretty,
                )
            } else {
                print_json(&commands::parse_ui_resources(document), pretty)
            }
        }
        UiCommand::ParseFile { path } => {
            print_backend(commands::parse_ui_resource_file(path), pretty)
        }
        UiCommand::Update {
            document,
            key,
            x,
            y,
            width,
            height,
            default_option,
        } => print_json(
            &commands::update_ui_resource_document(UiResourceUpdateRequest {
                document: read_json_value(&document)?,
                key,
                x,
                y,
                width,
                height,
                default_option,
            }),
            pretty,
        ),
        UiCommand::AddOption {
            document,
            key,
            sources,
        } => print_json(
            &commands::add_ui_resource_option_document(UiResourceOptionAddRequest {
                document: read_json_value(&document)?,
                key,
                sources,
            }),
            pretty,
        ),
        UiCommand::RemoveOption {
            document,
            key,
            option_index,
        } => print_json(
            &commands::remove_ui_resource_option_document(UiResourceOptionRemoveRequest {
                document: read_json_value(&document)?,
                key,
                option_index,
            }),
            pretty,
        ),
    }
}

fn run_table(command: TableCommand, pretty: bool) -> Result<(), CliError> {
    match command {
        TableCommand::Spec { kind } => {
            print_json(&commands::legacy_table_spec(kind.into()), pretty)
        }
        TableCommand::ValidateHeaders { kind, headers } => print_json(
            &commands::validate_table_headers(kind.into(), headers),
            pretty,
        ),
        TableCommand::Import { command } => run_table_import(command, pretty),
        TableCommand::ExportCsv { path, table } => print_unit_backend(
            commands::export_table_csv(ExportTableRequest {
                path,
                document: read_json_typed(&table)?,
            }),
            pretty,
        ),
        TableCommand::ExportWorkbook { path, table } => print_unit_backend(
            commands::export_table_workbook(ExportTableRequest {
                path,
                document: read_json_typed(&table)?,
            }),
            pretty,
        ),
        TableCommand::FromLanguageDocument { document } => print_json(
            &commands::language_document_table(read_json_value(&document)?),
            pretty,
        ),
        TableCommand::FromPdoSimpleDocument { document } => print_json(
            &commands::pdo_simple_document_table(read_json_value(&document)?),
            pretty,
        ),
        TableCommand::FromSdoDocument { document } => print_json(
            &commands::sdo_document_table(read_json_value(&document)?),
            pretty,
        ),
    }
}

fn run_table_import(command: TableImportCommand, pretty: bool) -> Result<(), CliError> {
    match command {
        TableImportCommand::Sdo { table } => print_json(
            &commands::import_sdo_table(read_json_typed(&table)?),
            pretty,
        ),
        TableImportCommand::SdoCsv { path } => {
            print_backend(commands::import_sdo_csv(TableFileRequest { path }), pretty)
        }
        TableImportCommand::SdoWorkbook { path } => print_backend(
            commands::import_sdo_workbook(TableFileRequest { path }),
            pretty,
        ),
        TableImportCommand::PdoSimple { table } => print_json(
            &commands::import_pdo_simple_table(read_json_typed(&table)?),
            pretty,
        ),
        TableImportCommand::PdoSimpleCsv { path } => print_backend(
            commands::import_pdo_simple_csv(TableFileRequest { path }),
            pretty,
        ),
        TableImportCommand::PdoSimpleWorkbook { path } => print_backend(
            commands::import_pdo_simple_workbook(TableFileRequest { path }),
            pretty,
        ),
        TableImportCommand::Language { table } => print_json(
            &commands::import_language_table(read_json_typed(&table)?),
            pretty,
        ),
        TableImportCommand::LanguageCsv { path } => print_backend(
            commands::import_language_csv(TableFileRequest { path }),
            pretty,
        ),
        TableImportCommand::LanguageWorkbook { path } => print_backend(
            commands::import_language_workbook(TableFileRequest { path }),
            pretty,
        ),
    }
}

fn run_pdo(command: PdoCommand, pretty: bool) -> Result<(), CliError> {
    match command {
        PdoCommand::Advanced { command } => match command {
            PdoAdvancedCommand::Parse { document } => print_json(
                &commands::parse_pdo_advanced_project(read_json_value(&document)?),
                pretty,
            ),
            PdoAdvancedCommand::ParseFile { path } => {
                print_backend(commands::parse_pdo_advanced_file(path), pretty)
            }
        },
    }
}

fn run_export(command: ExportCommand, pretty: bool) -> Result<(), CliError> {
    match command {
        ExportCommand::Plan {
            document,
            output_dir,
            project_path,
        } => print_json(
            &commands::build_project_export_plan(ExportPlanRequest {
                project_path,
                output_dir,
                document: read_json_value(&document)?,
            }),
            pretty,
        ),
        ExportCommand::Package {
            document,
            output_dir,
            project_path,
        } => print_json(
            &commands::export_project_package_command(ExportPlanRequest {
                project_path,
                output_dir,
                document: read_json_value(&document)?,
            }),
            pretty,
        ),
        ExportCommand::CopyUiImages {
            document,
            output_dir,
            project_path,
        } => print_json(
            &commands::copy_ui_resource_images(ExportPlanRequest {
                project_path,
                output_dir,
                document: read_json_value(&document)?,
            }),
            pretty,
        ),
    }
}

fn run_binary(command: BinaryCommand, pretty: bool) -> Result<(), CliError> {
    match command {
        BinaryCommand::Build {
            document,
            write_bytes,
        } => {
            let report = commands::build_project_binary_report(read_json_value(&document)?);
            if let Some(path) = write_bytes {
                fs::write(path, &report.bytes)?;
            }
            print_json(&report, pretty)
        }
        BinaryCommand::Compare {
            document,
            legacy_binary_path,
        } => print_json(
            &commands::compare_project_binary_report(BinaryCompareRequest {
                document: read_json_value(&document)?,
                legacy_binary_path,
            }),
            pretty,
        ),
    }
}

impl From<CliTableKind> for LegacyTableKind {
    fn from(kind: CliTableKind) -> Self {
        match kind {
            CliTableKind::Sdo => LegacyTableKind::Sdo,
            CliTableKind::PdoSimple => LegacyTableKind::PdoSimple,
            CliTableKind::Language => LegacyTableKind::Language,
        }
    }
}

fn read_json_value(path_or_stdin: &str) -> Result<Value, CliError> {
    read_json_typed(path_or_stdin)
}

fn read_json_typed<T>(path_or_stdin: &str) -> Result<T, CliError>
where
    T: DeserializeOwned,
{
    let content = if path_or_stdin == "-" {
        let mut content = String::new();
        std::io::stdin().read_to_string(&mut content)?;
        content
    } else {
        fs::read_to_string(path_or_stdin)?
    };

    Ok(serde_json::from_str(&content)?)
}

fn print_backend<T>(result: Result<T, String>, pretty: bool) -> Result<(), CliError>
where
    T: Serialize,
{
    let value = result.map_err(CliError::Backend)?;
    print_json(&value, pretty)
}

fn print_unit_backend(result: Result<(), String>, pretty: bool) -> Result<(), CliError> {
    result.map_err(CliError::Backend)?;
    print_json(&OkResponse { ok: true }, pretty)
}

fn print_json<T>(value: &T, pretty: bool) -> Result<(), CliError>
where
    T: Serialize,
{
    let output = if pretty {
        serde_json::to_string_pretty(value)
    } else {
        serde_json::to_string(value)
    }
    .map_err(CliError::Output)?;
    println!("{output}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nested_table_spec_command() {
        let cli = Cli::try_parse_from(["jc-cli", "table", "spec", "pdo-simple"]).unwrap();
        assert!(!cli.pretty);
        assert!(matches!(
            cli.command,
            Commands::Table {
                command: TableCommand::Spec {
                    kind: CliTableKind::PdoSimple
                }
            }
        ));
    }

    #[test]
    fn parses_global_pretty_flag_after_subcommand() {
        let cli = Cli::try_parse_from(["jc-cli", "table", "spec", "sdo", "--pretty"]).unwrap();
        assert!(cli.pretty);
    }

    #[test]
    fn parses_document_from_stdin_marker() {
        let cli =
            Cli::try_parse_from(["jc-cli", "project", "validate", "--document", "-"]).unwrap();
        assert!(matches!(
            cli.command,
            Commands::Project {
                command: ProjectCommand::Validate { .. }
            }
        ));
    }
}
