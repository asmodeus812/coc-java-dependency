// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path"
import {
    commands, Extension, ExtensionContext, extensions, Uri, window,
} from "coc.nvim"
import {buildFiles} from "./constants"
import {Settings} from "./settings"
import {syncHandler} from "./syncHandler"
import {languageServerApiManager} from "./languageServerApi/languageServerApiManager"
import {DependencyExplorer} from "./views/dependencyExplorer"
import {Commands} from "coc-java-dependency/src/commands"
import {getJavaExtension} from 'coc-java-dependency/src/utils/Client'

export async function activate(context: ExtensionContext): Promise<void> {
    await activateExtension(context)
    addExtensionChangeListener(context)
}

async function activateExtension(context: ExtensionContext): Promise<void> {
    Settings.initialize(context)
    languageServerApiManager.initialize(context)
    context.subscriptions.push(DependencyExplorer.getInstance(context))
    context.subscriptions.push(syncHandler)
}

export function addExtensionChangeListener(context: ExtensionContext): void {
    const extension: Extension<any> | undefined = getJavaExtension()
    if (!extension) {
        const extensionChangeListener = extensions.onDidLoadExtension(() => {
            commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, /* debounce = */false)
            extensionChangeListener.dispose()
        })
        context.subscriptions.push(extensionChangeListener)
    }
}
