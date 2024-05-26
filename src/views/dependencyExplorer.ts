// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import AwaitLock from "await-lock"
import * as fse from "fs-extra"
import * as _ from "lodash"
import * as path from "path"
import {
    commands, Disposable, ExtensionContext, QuickPickItem, TextEditor, TreeView,
    TreeViewExpansionEvent, TreeViewSelectionChangeEvent, TreeViewVisibilityChangeEvent, Uri, window,
    workspace,
} from "coc.nvim"
import { Commands } from "../commands"
import { Jdtls } from "../java/jdtls"
import { INodeData } from "../java/nodeData"
import { Settings } from "../settings"
import { EventCounter, Utility } from "../utility"
import { DataNode } from "./dataNode"
import { DependencyDataProvider } from "./dependencyDataProvider"
import { ExplorerNode } from "./explorerNode"
import { explorerNodeCache } from "./nodeCache/explorerNodeCache"

export class DependencyExplorer implements Disposable {

    public static getInstance(context: ExtensionContext): DependencyExplorer {
        if (!this._instance) {
            this._instance = new DependencyExplorer(context)
        }
        return this._instance
    }

    private static _instance: DependencyExplorer

    private _dependencyViewer: TreeView<ExplorerNode>

    private _dataProvider: DependencyDataProvider

    private _revealLock: AwaitLock

    constructor(public readonly context: ExtensionContext) {
        this._dataProvider = new DependencyDataProvider(context)
        this._dependencyViewer = window.createTreeView(
            "Java project explorer",
            {
                bufhidden: 'hide',
                treeDataProvider: this._dataProvider
            }
        )
        this._revealLock = new AwaitLock()

        context.subscriptions.push(
            window.onDidChangeActiveTextEditor((textEditor: TextEditor | undefined) => {
                if (this._dependencyViewer.visible && textEditor?.document) {
                    const uri: Uri = Uri.parse(textEditor.document.uri)
                    this.reveal(uri)
                }
            }),
            this._dependencyViewer.onDidChangeVisibility((e: TreeViewVisibilityChangeEvent) => {
                if (e.visible && window.activeTextEditor) {
                    this.reveal(Uri.parse(window.activeTextEditor.document.uri))
                }
            }),
            this._dataProvider.onDidChangeTreeData(() => {
                if (this._dependencyViewer.visible && window.activeTextEditor) {
                    this.reveal(Uri.parse(window.activeTextEditor.document.uri))
                }
            }),
            commands.registerCommand(Commands.VIEW_PACKAGE_REVEAL_IN_PROJECT_EXPLORER, async () => {
                // await commands.executeCommand(Commands.JAVA_PROJECT_EXPLORER_FOCUS);
                // let fsPath: string = uri.fsPath;
                // const fileName: string = path.basename(fsPath);
                // if (/(.*\.gradle)|(.*\.gradle\.kts)|(pom\.xml)$/.test(fileName)) {
                //     fsPath = path.dirname(fsPath);
                // }
                // uri = Uri.file(fsPath);
                // if ((await fse.stat(fsPath)).isFile()) {
                //     await commands.executeCommand(Commands.VSCODE_OPEN, uri, {preserveFocus: true});
                // }
                // workspace.has

                window.showWarningMessage(`${JSON.stringify(window.activeTextEditor?.document.uri)}`)
                this.reveal(Uri.parse(window.activeTextEditor?.document?.uri), false)
            }),
            commands.registerCommand(Commands.JAVA_PROJECT_EXPLORER_SHOW_NONJAVA_RESOURCES, async () => {
                Settings.switchNonJavaResourceFilter(true)
            }),
            commands.registerCommand(Commands.JAVA_PROJECT_EXPLORER_HIDE_NONJAVA_RESOURCES, async () => {
                Settings.switchNonJavaResourceFilter(false)
            }),
        )

        // register telemetry events
        context.subscriptions.push(
            this._dependencyViewer.onDidChangeSelection((_e: TreeViewSelectionChangeEvent<ExplorerNode>) => {
                EventCounter.increase("didChangeSelection")
            }),
            this._dependencyViewer.onDidCollapseElement((_e: TreeViewExpansionEvent<ExplorerNode>) => {
                EventCounter.increase("didCollapseElement")
            }),
            this._dependencyViewer.onDidExpandElement((_e: TreeViewExpansionEvent<ExplorerNode>) => {
                EventCounter.increase("didExpandElement")
            }),
        )
    }

    public dispose(): void {
        if (this._dependencyViewer) {
            this._dependencyViewer.dispose()
        }
    }

    public async reveal(uri: Uri, needCheckSyncSetting: boolean = true): Promise<void> {
        try {
            await this._revealLock.acquireAsync()
            if (needCheckSyncSetting && !Settings.syncWithFolderExplorer()) {
                return
            }

            if (!await Utility.isRevealable(uri)) {
                return
            }

            let node: DataNode | undefined = explorerNodeCache.getDataNode(uri)
            if (!node) {
                const paths: INodeData[] = await Jdtls.resolvePath(uri.toString())
                if (!_.isEmpty(paths)) {
                    node = await this._dataProvider.revealPaths(paths)
                }
            }

            if (!node) {
                return
            }

            if (!this._dependencyViewer?.visible) {
                await this._dependencyViewer?.show()
            }
            await this._dependencyViewer.reveal(node, { select: true, focus: true, expand: true })
        } finally {
            this._revealLock.release()
        }
    }

    public get dataProvider(): DependencyDataProvider {
        return this._dataProvider
    }

    private async promptForProjectNode(): Promise<DataNode | undefined> {
        const projects = await this._dataProvider.getRootProjects();
        if (projects.length === 0) {
            window.showInformationMessage("There is no Java projects in current workspace.");
            return undefined;
        } else if (projects.length === 1) {
            return projects[0] as DataNode;
        } else {
            const options: IProjectPickItem[] = projects.map((p: DataNode) => {
                return {
                    label: p.name,
                    node: p,
                };
            });
            const choice: IProjectPickItem | undefined = await window.showQuickPick(options, {
                title: "Project node",
                placeholder: "Choose a project",
            });
            return choice?.node as DataNode;
        }
    }
}

interface IProjectPickItem extends QuickPickItem {
    node: ExplorerNode;
}
