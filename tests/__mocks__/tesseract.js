// Mock for Tesseract.js
export default {
    createWorker: jest.fn(() => ({
        loadLanguage: jest.fn(),
        initialize: jest.fn(),
        setParameters: jest.fn(),
        recognize: jest.fn(() => Promise.resolve({
            data: {
                text: 'Mock OCR text',
                words: [
                    {
                        text: 'Mock',
                        confidence: 95,
                        bbox: { x0: 10, y0: 10, x1: 50, y1: 30 }
                    },
                    {
                        text: 'OCR',
                        confidence: 92,
                        bbox: { x0: 60, y0: 10, x1: 100, y1: 30 }
                    },
                    {
                        text: 'text',
                        confidence: 90,
                        bbox: { x0: 110, y0: 10, x1: 150, y1: 30 }
                    }
                ]
            }
        })),
        terminate: jest.fn()
    })),
    OEM: {
        LSTM_ONLY: 1
    }
};