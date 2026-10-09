# DSLX Syntax

Syntax highlighting and basic editing support for [Google XLS DSLX](https://github.com/google/xls) in Visual Studio Code. No language server, XLS installation, or runtime dependencies are required.

## Features

- Recognizes `.x` and `.dslx` files as DSLX.
- Highlights declarations, keywords, bit types, numeric literals, attributes, macros, and function calls.
- Supports line comments, strings, character literals, multiline backtick strings, and escape sequences.
- Highlights proc and channel constructs, bit slicing, concatenation, and other DSLX operators.
- Provides bracket matching, automatic bracket/quote pairing, and line-comment toggling.
- Keeps primed identifiers such as `value'` intact without automatically inserting a closing apostrophe.

```dslx
fn widen_add(left: u8, right: u8) -> u9 {
    (left as u9) + (right as u9)
}

#[test]
fn arithmetic_test() {
    assert_eq(widen_add(u8:255, u8:1), u9:256);
}
```

See [examples/highlighting.x](examples/highlighting.x) for more syntax examples.

## Requirements

Visual Studio Code 1.85.0 or later. Node.js is only needed to develop or package the extension, not to use it.

## Installation

### From a VSIX

1. Download a `.vsix` file from [GitHub Releases](https://github.com/kele14x/dslx-syntax-vscode/releases), or build one locally using the instructions below.
2. Open the Extensions view in VS Code.
3. Select **Install from VSIX...** from the Extensions view menu and choose the file.

### From the Marketplace

Install [DSLX Syntax from the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=kele14x.dslx-syntax), or search for `@id:kele14x.dslx-syntax` in the Extensions view and select **Install**.

## Usage

Open a `.x` or `.dslx` file. The language mode in the status bar should read **DSLX**. If another extension claims the file type, select the language mode and choose **DSLX** manually.

Use VS Code's **Toggle Line Comment** command to add or remove `//` comments. Highlighting colors depend on your active theme.

This extension uses a TextMate grammar, not a compiler or language server. It does not provide type checking, diagnostics, formatting, semantic completion, or go-to-definition. Syntax highlighting does not guarantee that a program is valid DSLX.

## Development

Use Node.js 24 or later.

```sh
npm ci
npm test
npm run package
```

The packaging command runs the grammar tests and creates a `dslx-syntax-<version>.vsix` file in the repository root.

To run editor integration tests:

```sh
npm run test:editor
```

The editor test runner downloads VS Code when needed and uses an isolated temporary profile. Set `VSCODE_EXECUTABLE_PATH` to use an existing compatible VS Code executable instead.

To inspect highlighting manually, open this repository in VS Code and press **F5** to launch the extension development host with `examples/highlighting.x`.

## Releases

CI runs tests for pushes to `main`, pull requests, and manual runs. Only a pushed `v*` tag builds a VSIX and publishes it as a GitHub Release asset; CI does not upload Actions artifacts.

Before releasing, update the version in `package.json` and `package-lock.json`, commit the changes, and push a matching tag such as `v0.1.1`. The workflow rejects a tag that does not match the extension version.

GitHub Releases and the VS Code Marketplace are separate distribution channels. The current workflow does not publish to the Marketplace; upload the release VSIX through your publisher's Marketplace management page.

## Feedback

Report highlighting issues with a small DSLX example and your VS Code version in [GitHub Issues](https://github.com/kele14x/dslx-syntax-vscode/issues).

## License

[MIT](LICENSE). This is an independent extension for DSLX, which is part of the Google XLS project.
