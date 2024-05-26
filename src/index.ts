// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path"
import {
    commands, Diagnostic, Extension, ExtensionContext, extensions,
    Document, TextEditor, Uri, window, workspace,
    diagnosticManager
} from "coc.nvim"
import { buildFiles, Context } from "./constants"
import { Settings } from "./settings"
import { syncHandler } from "./syncHandler"
import { languageServerApiManager } from "./languageServerApi/languageServerApiManager"
import { DependencyExplorer } from "./views/dependencyExplorer"
import { Commands } from "coc-java-dependency/src/commands"

export async function activate(context: ExtensionContext): Promise<void> {
    await activateExtension(context)
    addExtensionChangeListener(context)
}

async function activateExtension(context: ExtensionContext): Promise<void> {
    Settings.initialize(context)
    languageServerApiManager.initialize(context)
    context.subscriptions.push(DependencyExplorer.getInstance(context))
    context.subscriptions.push(syncHandler)
    context.subscriptions.push(commands.registerCommand(Commands.JAVA_PROJECT_RELOAD_ACTIVE_FILE, (uri?: Uri) => {
        if (!uri) {
            const activeDocument = window.activeTextEditor?.document
            if (!activeDocument) {
                return
            }
            uri = Uri.parse(activeDocument.uri)
        }

        if (!buildFiles.includes(path.basename(uri.fsPath))) {
            return
        }
        commands.executeCommand(Commands.JAVA_PROJECT_CONFIGURATION_UPDATE, uri)
    }))
}

export async function deactivate(): Promise<void> {
}

function addExtensionChangeListener(context: ExtensionContext): void {
    const extension: Extension<any> | undefined = getJavaExtension()
    if (!extension) {
        const extensionChangeListener = extensions.onDidLoadExtension(() => {
            commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, /* debounce = */false)
            extensionChangeListener.dispose()
        })
        context.subscriptions.push(extensionChangeListener)
    }
}

function getJavaExtension(): Extension<any> | undefined {
    const java = extensions.getExtensionById("coc-java")
    if (!java || java == null || java === undefined) {
        return extensions.getExtensionById("coc-java-dev")
    }
    return java
}
