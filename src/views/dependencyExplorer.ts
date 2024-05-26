// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import AwaitLock from "await-lock"
import * as _ from "lodash"
import {
    workspace, nvim, commands, Disposable, ExtensionContext, TextEditor, TreeView,
    Document, TreeViewExpansionEvent, TreeViewSelectionChangeEvent, TreeViewVisibilityChangeEvent, Uri, window,
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

    private _auxWinId: number

    constructor(public readonly context: ExtensionContext) {
        this._dataProvider = new DependencyDataProvider(context)
        this._dependencyViewer = window.createTreeView(
            "PROJECT EXPLORER",
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
                let result: Document | undefined = window.activeTextEditor?.document
                if (!result) {
                    result = (await workspace.document)
                }
                if (result) {
                    this.reveal(Uri.parse(result.uri), false)
                } else {
                    window.showErrorMessage("Unable to resolve the currently active document")
                }
            }),
            commands.registerCommand(Commands.JAVA_PROJECT_EXPLORER_SHOW_NONJAVA_RESOURCES, () => {
                Settings.switchNonJavaResourceFilter(true)
            }),
            commands.registerCommand(Commands.JAVA_PROJECT_EXPLORER_HIDE_NONJAVA_RESOURCES, () => {
                Settings.switchNonJavaResourceFilter(false)
            }),
            commands.registerCommand(Commands.JAVA_PROJECT_EXPLORER_RESOURCE_OPEN, async (uri: string, openCommand?: string) => {
                await nvim.call('win_gotoid', [this._auxWinId])
                await workspace.jumpTo(uri, null, openCommand)
            })
        )

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

            if (this._dependencyViewer?.visible) {
                const winId = this._dependencyViewer.windowId
                const tabnr = await nvim.call('tabpagenr') as number
                const buflist = await nvim.call('tabpagebuflist', [tabnr]) as number[]
                const bufId = await nvim.call('winbufnr', [winId])
                const found = buflist.find((bufnr) => { return bufId == bufnr })
                if (!found) {
                    await nvim.call('coc#window#close', [winId])
                    this._auxWinId = await nvim.call("win_getid") as number
                    await this._dependencyViewer?.show('botright 40vs')
                }
            } else if (!this._dependencyViewer?.visible) {
                this._auxWinId = await nvim.call("win_getid") as number
                const viewId = await nvim.eval(`get(w:,'cocViewId', v:null)`) as string
                // let winid = await nvim.call('coc#window#find', ['cocViewId', 'PROJECT EXPLORER']) as number
                if (viewId) {
                    await nvim.command(`let w:cocViewId = ''`)
                }
                await this._dependencyViewer?.show('botright 40vs')
            }
            await this._dependencyViewer.reveal(node, { select: true, focus: true, expand: true })
        } finally {
            this._revealLock.release()
        }
    }

    public get dataProvider(): DependencyDataProvider {
        return this._dataProvider
    }
}
