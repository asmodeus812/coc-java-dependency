// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import {
    commands, ConfigurationChangeEvent, ConfigurationTarget, ExtensionContext,
    workspace,
} from "coc.nvim";
import {Commands} from "./commands";
import {syncHandler} from "./syncHandler";

export class Settings {

    public static initialize(context: ExtensionContext): void {
        context.subscriptions.push(workspace.onDidChangeConfiguration((e: ConfigurationChangeEvent) => {
            if ((e.affectsConfiguration("java.dependency.syncWithFolderExplorer") && Settings.syncWithFolderExplorer()) ||
                e.affectsConfiguration("java.dependency.showMembers") ||
                e.affectsConfiguration("java.dependency.packagePresentation") ||
                e.affectsConfiguration("java.project.explorer.showNonJavaResources") ||
                e.affectsConfiguration("files.exclude")) {
                commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH);
            } else if (e.affectsConfiguration("java.dependency.autoRefresh")) {
                syncHandler.updateFileWatcher(Settings.autoRefresh());
            }
        }));

        syncHandler.updateFileWatcher(Settings.autoRefresh());

        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_CHANGETOFLATPACKAGEVIEW,
            Settings.changeToFlatPackageView));

        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_CHANGETOHIERARCHICALPACKAGEVIEW,
            Settings.changeToHierarchicalPackageView));
    }

    public static changeToFlatPackageView(): void {
        workspace.getConfiguration("java.dependency").update("packagePresentation", PackagePresentation.Flat);
    }

    public static changeToHierarchicalPackageView(): void {
        workspace.getConfiguration("java.dependency").update("packagePresentation", PackagePresentation.Hierarchical);
    }

    public static switchNonJavaResourceFilter(enabled: boolean): void {
        workspace.getConfiguration("java.project.explorer").update("showNonJavaResources", enabled);
    }

    public static showMembers(): boolean {
        return workspace.getConfiguration("java.dependency").get("showMembers", false);
    }

    public static autoRefresh(): boolean {
        return workspace.getConfiguration("java.dependency").get("autoRefresh", true);
    }

    public static syncWithFolderExplorer(): boolean {
        return workspace.getConfiguration("java.dependency").get("syncWithFolderExplorer", true);
    }

    public static isHierarchicalView(): boolean {
        return workspace.getConfiguration("java.dependency").get<string>("packagePresentation", PackagePresentation.Flat) === PackagePresentation.Hierarchical;
    }

    public static refreshDelay(): number {
        return workspace.getConfiguration("java.dependency").get("refreshDelay", 2000);
    }

    public static showNonJavaResources(): boolean {
        return workspace.getConfiguration("java.project.explorer").get("showNonJavaResources", false);
    }
}

enum PackagePresentation {
    Flat = "flat",
    Hierarchical = "hierarchical",
}

export interface IReferencedLibraries {
    include: string[];
    exclude: string[];
    sources: {[binary: string]: string};
}
