// PDF-Extract-Kit Integration Documentation
// These Python scripts are from the PDF-Extract-Kit project
// They provide advanced PDF processing capabilities:

export const PDFExtractKit = {
    scripts: {
        tableParser: {
            name: 'Table Parsing',
            file: 'table_parsing.py',
            description: 'Extracts and parses tables from PDF documents',
            usage: 'python table_parsing.py <pdf_file>'
        },
        layoutDetection: {
            name: 'Layout Detection',
            file: 'layout_detection.py',
            description: 'Detects and analyzes document layout structure',
            usage: 'python layout_detection.py <pdf_file>'
        },
        formulaDetection: {
            name: 'Formula Detection',
            file: 'formula_detection.py',
            description: 'Detects mathematical formulas in PDFs',
            usage: 'python formula_detection.py <pdf_file>'
        },
        formulaRecognition: {
            name: 'Formula Recognition',
            file: 'formula_recognition.py',
            description: 'Recognizes and extracts mathematical formulas',
            usage: 'python formula_recognition.py <pdf_file>'
        }
    },
    
    // Note: These scripts require server-side execution
    // They cannot run directly in the browser
    // This is a reference for future server integration
    
    getScriptInfo() {
        return Object.values(this.scripts).map(script => ({
            name: script.name,
            file: `/client-ocr-app/scripts/${script.file}`,
            description: script.description
        }));
    }
};

// Export for documentation purposes
window.PDFExtractKit = PDFExtractKit;