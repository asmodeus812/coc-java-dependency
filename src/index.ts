// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import {
    commands, Extension, ExtensionContext, extensions
} from "coc.nvim"
import {Settings} from "./settings"
import {syncHandler} from "./syncHandler"
import {languageServerApiManager} from "./languageServerApi/languageServerApiManager"
import {DependencyExplorer} from "./views/dependencyExplorer"
import {Commands} from "./commands"
import {getJavaExtension} from './utils/Client'

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
