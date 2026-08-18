// Enforces SIMPLE_JAVASCRIPT_STANDARD.txt.
//
// Section 29: important restrictions are automated rather than left to review.
// Section 28: ESLint Stylistic is the formatting authority; `npm run format`
// applies it.

import stylistic from "@stylistic/eslint-plugin";

const NODE_GLOBALS = {
    process: "readonly",
    console: "readonly",
    Buffer: "readonly",
    fetch: "readonly",
    URL: "readonly",
    AbortSignal: "readonly",
    setTimeout: "readonly",
    structuredClone: "readonly",
};

const BROWSER_GLOBALS = {
    console: "readonly",
    document: "readonly",
    window: "readonly",
    fetch: "readonly",
    URL: "readonly",
    Blob: "readonly",
    performance: "readonly",
    PerformanceObserver: "readonly",
    setInterval: "readonly",
    setTimeout: "readonly",
    addEventListener: "readonly",
    chrome: "readonly",
};

// Section 21: dynamic language features are not part of the subset.
const BANNED_GLOBALS = [
    { name: "eval", message: "Section 21: eval is not part of the standard." },
    { name: "Proxy", message: "Section 21: Proxy is not for application architecture." },
];

const STANDARD_RULES = {
    // Section 3
    "no-var": "error",
    "prefer-const": "error",
    "no-implicit-globals": "error",
    // Catches calls to names that do not exist, such as a helper that was
    // renamed at its definition but not at its call sites.
    "no-undef": "error",
    // Section 4
    eqeqeq: ["error", "always"],
    // Section 9: obvious control flow, always braced.
    curly: ["error", "all"],
    // Section 10
    "no-nested-ternary": "error",
    // Section 19
    "no-throw-literal": "error",
    // Section 21
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",
    "no-extend-native": "error",
    "no-proto": "error",
    "no-restricted-globals": ["error", ...BANNED_GLOBALS],
    "no-with": "error",
    // Section 22
    "no-labels": "error",
    "no-sequences": "error",
    // Section 29
    "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "no-unreachable": "error",
};

// Section 28, as amended above: the house style, taken from the standard's own
// examples — Allman braces, four spaces, double quotes, semicolons.
const FORMATTING_RULES = {
    "@stylistic/brace-style": ["error", "allman", { allowSingleLine: false }],
    "@stylistic/indent": ["error", 4],
    "@stylistic/quotes": ["error", "double", { avoidEscape: true }],
    "@stylistic/semi": ["error", "always"],
    "@stylistic/comma-dangle": ["error", "always-multiline"],
    "@stylistic/arrow-parens": ["error", "always"],
    "@stylistic/object-curly-spacing": ["error", "always"],
    "@stylistic/keyword-spacing": "error",
    "@stylistic/space-before-blocks": "error",
    "@stylistic/no-trailing-spaces": "error",
    "@stylistic/eol-last": ["error", "always"],
};

const RULES = { ...STANDARD_RULES, ...FORMATTING_RULES };

export default [
    {
        ignores: ["dist/**", "node_modules/**", "src/assets/**", "src/rules/**"],
    },
    {
        // Build scripts.
        files: ["scripts/**/*.mjs", "eslint.config.js"],
        plugins: { "@stylistic": stylistic },
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            globals: NODE_GLOBALS,
        },
        rules: RULES,
    },
    {
        // Extension source.
        files: ["src/**/*.js"],
        plugins: { "@stylistic": stylistic },
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            globals: BROWSER_GLOBALS,
        },
        rules: RULES,
    },
];
