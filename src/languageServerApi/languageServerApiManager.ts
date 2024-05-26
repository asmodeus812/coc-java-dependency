// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import {commands, Event, Extension, ExtensionContext, extensions, Uri, window} from "coc.nvim";
import {Commands} from "../commands";
import {Settings} from "../settings";
import {syncHandler} from "../syncHandler";
import {LanguageServerMode} from "./LanguageServerMode";

class LanguageServerApiManager {
    private extensionApi: any;
    private isServerReady: boolean = false;
    private context: ExtensionContext;

    public initialize(context: ExtensionContext) {
        this.context = context;
    }

    public async ready(): Promise<boolean> {
        if (this.isServerReady) {
            return true;
        }

        if (!this.isApiInitialized()) {
            await this.initializeJavaLanguageServerApis();
        }

        const serverMode: LanguageServerMode | undefined = this.extensionApi?.serverMode;
        if (!serverMode || serverMode === LanguageServerMode.LightWeight) {
            return false;
        }

        await this.extensionApi.serverReady();
        this.isServerReady = true;
        return true;
    }

    public async initializeJavaLanguageServerApis(): Promise<void> {
        if (this.isApiInitialized()) {
            return;
        }

        const extension: Extension<any> | undefined = this.getJavaExtension()
        if (extension) {
            await extension.activate();
            const extensionApi: any = extension.exports;
            if (!extensionApi) {
                window.showErrorMessage("Please update coc-java to the latest version.");
                return;
            }

            this.extensionApi = extensionApi;
            if (extensionApi.onDidClasspathUpdate) {
                const onDidClasspathUpdate: Event<Uri> = extensionApi.onDidClasspathUpdate;
                this.context.subscriptions.push(onDidClasspathUpdate(() => {
                    commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, /* debounce = */true);
                    syncHandler.updateFileWatcher(Settings.autoRefresh());
                }));
            }

            if (extensionApi.onDidProjectsImport) {
                const onDidProjectsImport: Event<Uri[]> = extensionApi.onDidProjectsImport;
                this.context.subscriptions.push(onDidProjectsImport(() => {
                    commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, /* debounce = */true);
                    syncHandler.updateFileWatcher(Settings.autoRefresh());
                }));
            }

            if (extensionApi.onDidProjectsDelete) {
                const onDidProjectsDelete: Event<Uri[]> = extensionApi.onDidProjectsDelete;
                this.context.subscriptions.push(onDidProjectsDelete(() => {
                    commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, /* debounce = */true);
                    syncHandler.updateFileWatcher(Settings.autoRefresh());
                }));

            }

            if (this.extensionApi?.serverMode === LanguageServerMode.LightWeight) {
                if (extensionApi.onDidServerModeChange) {
                    const onDidServerModeChange: Event<string> = extensionApi.onDidServerModeChange;
                    this.context.subscriptions.push(onDidServerModeChange((mode: LanguageServerMode) => {
                        if (mode === LanguageServerMode.Hybrid) {
                            commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, /* debounce = */false);
                        }
                    }));
                }
            }
        }
    }

    private isApiInitialized(): boolean {
        return this.extensionApi !== undefined;
    }

    public isReady(timeout: number): Promise<boolean> {
        return Promise.race([this.ready(), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeout))]);
    }

    private getJavaExtension(): Extension<any> | undefined {
        const java = extensions.getExtensionById("coc-java")
        if (!java || java == null || java === undefined) {
            return extensions.getExtensionById("coc-java-dev")
        }
        return java
    }
}

export const languageServerApiManager: LanguageServerApiManager = new LanguageServerApiManager();
