// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import {
    nvim, commands, Event, Emitter, ExtensionContext, ProviderResult,
    RelativePattern, TreeDataProvider, TreeItem, Uri, window, workspace,
} from "coc.nvim";
import {Commands} from "../commands";
import {Jdtls} from "../java/jdtls";
import {INodeData, NodeKind} from "../java/nodeData";
import {languageServerApiManager} from "../languageServerApi/languageServerApiManager";
import {Settings} from "../settings";
import {explorerLock} from "../utils/Lock";
import {DataNode} from "./dataNode";
import {ExplorerNode} from "./explorerNode";
import {explorerNodeCache} from "./nodeCache/explorerNodeCache";
import {ProjectNode} from "./projectNode";
import {WorkspaceNode} from "./workspaceNode";

export class DependencyDataProvider implements TreeDataProvider<ExplorerNode> {

    private _onDidChangeTreeData: Emitter<ExplorerNode | null | undefined> = new Emitter<ExplorerNode | null | undefined>();

    // tslint:disable-next-line:member-ordering
    public onDidChangeTreeData: Event<ExplorerNode | null | undefined> = this._onDidChangeTreeData.event;

    private _rootItems: ExplorerNode[] | undefined = undefined;
    private _refreshDelayTrigger: _.DebouncedFunc<((element?: ExplorerNode) => void)>;
    /**
     * The element which is pending to be refreshed.
     * `undefined` denotes to root node.
     * `null` means no node is pending.
     */
    private pendingRefreshElement: ExplorerNode | undefined | null;

    constructor(public readonly context: ExtensionContext) {
        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, (debounce?: boolean, element?: ExplorerNode) =>
            this.refresh(debounce, element)));
        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_REFRESH, (debounce?: boolean, element?: ExplorerNode) =>
            this.refresh(debounce, element)));
        context.subscriptions.push(commands.registerCommand(Commands.JAVA_PROJECT_BUILD_WORKSPACE, () =>
            commands.executeCommand(Commands.JAVA_BUILD_WORKSPACE, true /*fullCompile*/)));
        context.subscriptions.push(commands.registerCommand(Commands.JAVA_PROJECT_CLEAN_WORKSPACE, () =>
            commands.executeCommand(Commands.JAVA_CLEAN_WORKSPACE)));
        context.subscriptions.push(commands.registerCommand(Commands.JAVA_PROJECT_UPDATE, async (node: INodeData) => {
            if (!node.uri) {
                window.showErrorMessage("The URI of the project is not available, you can try to trigger the command 'Java: Reload Project' from Command Palette.");
                return;
            }
            const pattern: RelativePattern = new RelativePattern(Uri.parse(node.uri).fsPath?.replace(/[\\\/]+$/, ""), "{pom.xml,*.gradle}");
            const uris: Uri[] = await workspace.findFiles(pattern, null /*exclude*/, 1 /*maxResults*/);
            if (uris.length >= 1) {
                commands.executeCommand(Commands.JAVA_PROJECT_CONFIGURATION_UPDATE, uris[0]);
            }
        }));
        context.subscriptions.push(commands.registerCommand(Commands.JAVA_PROJECT_REBUILD, async (node: INodeData) => {
            if (!node.uri) {
                window.showErrorMessage("The URI of the project is not available, you can try to trigger the command 'Java: Rebuild Projects' from Command Palette.");
                return;
            }
            commands.executeCommand(Commands.BUILD_PROJECT, Uri.parse(node.uri), true);
        }));

        this.setRefreshDebounceFunc();
    }

    public refresh(debounce = false, element?: ExplorerNode) {
        if (element === undefined || this.pendingRefreshElement === undefined) {
            this._refreshDelayTrigger(undefined);
            this.pendingRefreshElement = undefined;
        } else if (this.pendingRefreshElement === null
            || element.isItselfOrAncestorOf(this.pendingRefreshElement)) {
            this._refreshDelayTrigger(element);
            this.pendingRefreshElement = element;
        } else if (this.pendingRefreshElement.isItselfOrAncestorOf(element)) {
            this._refreshDelayTrigger(this.pendingRefreshElement);
        } else {
            this._refreshDelayTrigger.flush();
            this._refreshDelayTrigger(element);
            this.pendingRefreshElement = element;
        }
        if (!debounce) { // Immediately refresh
            this._refreshDelayTrigger.flush();
        }
    }

    public setRefreshDebounceFunc(wait?: number) {
        if (!wait) {
            wait = Settings.refreshDelay();
        }
        if (this._refreshDelayTrigger) {
            this._refreshDelayTrigger.cancel();
        }
        this._refreshDelayTrigger = _.debounce(this.doRefresh, wait);
    }

    public getTreeItem(element: ExplorerNode): TreeItem | Promise<TreeItem> {
        return element.getTreeItem();
    }

    public async getChildren(element?: ExplorerNode): Promise<ExplorerNode[] | undefined | null> {
        if (!await languageServerApiManager.ready()) {
            return [];
        }

        const children = (!this._rootItems || !element) ?
            await this.getRootNodes() : await element.getChildren();

        explorerNodeCache.saveNodes(children || []);
        return children;
    }

    public getParent(element: ExplorerNode): ProviderResult<ExplorerNode> {
        return element.getParent();
    }

    public async revealPaths(paths: INodeData[]): Promise<DataNode | undefined> {
        const projectNodeData = paths.shift();
        const projects = await this.getRootProjects();
        const project = projects ? <DataNode>projects.find((node: DataNode) =>
            node.path === projectNodeData?.path && node.nodeData.name === projectNodeData?.name) : undefined;
        return project?.revealPaths(paths);
    }

    public async getRootProjects(): Promise<ExplorerNode[]> {
        const rootElements = await this.getRootNodes();
        if (rootElements[0] instanceof ProjectNode) {
            return rootElements;
        } else {
            let result: ExplorerNode[] = [];
            for (const rootWorkspace of rootElements) {
                const projects = await rootWorkspace.getChildren();
                if (projects) {
                    result = result.concat(projects);
                }
            }
            return result;
        }
    }

    private doRefresh(element?: ExplorerNode): void {
        if (!element) {
            this._rootItems = undefined;
        }
        explorerNodeCache.removeNodeChildren(element);
        this._onDidChangeTreeData.fire(element);
        this.pendingRefreshElement = null;
    }

    private async getRootNodes(): Promise<ExplorerNode[]> {
        try {
            await explorerLock.acquireAsync();

            if (this._rootItems) {
                return this._rootItems;
            }

            const hasJavaError: boolean = await Jdtls.checkImportStatus();
            if (hasJavaError) {
                return [];
            }

            const rootItems: ExplorerNode[] = [];
            const folders = workspace.workspaceFolders;
            if (folders?.length) {
                if (folders.length > 1) {
                    folders.forEach((folder) => rootItems.push(new WorkspaceNode({
                        name: folder.name,
                        uri: folder.uri.toString(),
                        kind: NodeKind.Workspace,
                    }, undefined)));
                    this._rootItems = rootItems;
                } else {
                    const result: INodeData[] = await Jdtls.getProjects(folders[0].uri.toString());
                    result.forEach((project) => {
                        rootItems.push(new ProjectNode(project, undefined));
                    });
                    this._rootItems = rootItems;
                }
            }
            return rootItems;
        } finally {
            explorerLock.release();
        }
    }
}
