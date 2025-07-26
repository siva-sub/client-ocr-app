export default {
    testEnvironment: 'node',
    transform: {},
    moduleNameMapper: {
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        'tesseract\\.js$': '<rootDir>/tests/__mocks__/tesseract.js'
    },
    setupFiles: ['<rootDir>/tests/setup.js'],
    testMatch: [
        '**/tests/**/*.test.js',
        '**/__tests__/**/*.js'
    ],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.worker.js',
        '!src/**/index.js'
    ],
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70
        }
    }
};