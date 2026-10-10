/**
 * Streaming-safe CSV parser (plan §13): quoted multiline cells, doubled
 * quotes, BOM, CRLF, bounded field/row counts. Records are only split at
 * parser-confirmed boundaries. Errors are per row; parsing never throws.
 */
export interface CsvRow {
    /** 1-based line where the record starts. */
    line: number;
    values: string[];
}
export interface CsvError {
    line: number;
    code: "RaggedRow" | "UnterminatedQuote" | "TooManyFields" | "TooManyRows" | "InvalidEncoding";
    message: string;
}
export interface CsvOptions {
    maxFields?: number;
    maxRows?: number;
    maxCellBytes?: number;
    delimiter?: string;
}
export declare function parseCsv(bytes: Uint8Array, options?: CsvOptions): {
    header: string[];
    rows: Iterable<CsvRow>;
    errors: CsvError[];
};
