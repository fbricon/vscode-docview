import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
    highlight: function (str: string, lang: string): string {
        console.log("highlight", str, lang);
        return `<pre class="language-${lang}"><code class="language-${lang}">${md.utils.escapeHtml(str)}</code></pre>`;
    }
});

let docViewer: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('DocViewer activated');
    // Create and show panel

    let lastPosition: vscode.Position | undefined;

    // Handle cursor movements
    let debounceTimer: NodeJS.Timeout | undefined;
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(async event => {
            if (!docViewer) {
                return;
            }
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const position = editor.selection.active;

                if (lastPosition && position.isEqual(lastPosition)) {
                    return;
                }
                lastPosition = position;

                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }

                debounceTimer = setTimeout(async () => {
                    if (!docViewer) {
                        return;
                    }
                    await updateDocumentationContent(editor, position);
                }, 100); // 100ms debounce delay
            }
        })
    );

    // Register a single command for both menu item and command palette
    let disposable = vscode.commands.registerCommand('docview.open', openDocViewer);
    context.subscriptions.push(disposable);

}

async function getHoverInfo(document: vscode.TextDocument, position: vscode.Position): Promise<string | undefined> {
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        document.uri,
        position
    );

    if (hovers && hovers.length > 0) {
        return hovers.map(hover => {
            if (Array.isArray(hover.contents)) {
                return hover.contents.map(content => {
                    if (content instanceof vscode.MarkdownString) {
                        return content.value;
                    } else if (typeof content === 'string') {
                        return content;
                    } else if (typeof content === 'object' && 'language' in content && 'value' in content) {
                        return `\`\`\`${content.language}\n${content.value}\n\`\`\``;
                    }
                    return '';
                }).join('\n');
            }
        }).join('\n\n');
    }

    return undefined;
}

function getWebviewContent(content?: string) {
    const htmlContent = content ? md.render(content) : '';

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Documentation Viewer</title>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/themes/prism.min.css" rel="stylesheet" />
            <style>
                body {
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    padding: 10px;
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                }
                pre[class*="language-"] {
                    background-color: var(--vscode-textBlockQuote-background);
                    padding: 10px;
                    border-radius: 3px;
                }
                code[class*="language-"] {
                    font-family: var(--vscode-editor-font-family);
                    background-color: transparent;
                    padding: 0;
                    border-radius: 0;
                }
            </style>
        </head>
        <body>
            ${htmlContent}
            <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/components/prism-core.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/plugins/autoloader/prism-autoloader.min.js"></script>
            <script>
                Prism.highlightAll();
            </script>
        </body>
        </html>
    `;
}

async function openDocViewer(context: vscode.ExtensionContext) {
    const editor = vscode.window.activeTextEditor;
    if (docViewer) {
        docViewer.reveal(vscode.ViewColumn.Beside);
    } else {
        docViewer = vscode.window.createWebviewPanel(
            'docViewer',
            'Documentation Viewer',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        docViewer.onDidDispose(() => {
            docViewer = undefined;
        }, null, context.subscriptions);
    }
    if (editor) {
        await updateDocumentationContent(editor, editor.selection.active);
    }
}

async function updateDocumentationContent(editor: vscode.TextEditor, position: vscode.Position) {
    const docContent = await getHoverInfo(editor.document, position);
    if (docViewer) {
        docViewer.webview.html = getWebviewContent(docContent);
    }
}

export function deactivate() {}

