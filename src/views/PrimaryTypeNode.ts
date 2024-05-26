// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command, DocumentSymbol, SymbolInformation, SymbolKind, TextDocument, Uri, workspace } from "coc.nvim"
import { DocumentSymbolParams } from 'vscode-languageserver-protocol'
import { Commands } from "../commands"
import { Explorer } from "../constants"
import { INodeData, TypeKind } from "../java/nodeData"
import { Settings } from "../settings"
import { isTest } from "../utility"
import { DataNode } from "./dataNode"
import { DocumentSymbolNode } from "./documentSymbolNode"
import { ExplorerNode } from "./explorerNode"
import { ProjectNode } from "./projectNode"
import { getJavaExtensionApi } from '../utils/Client'

export class PrimaryTypeNode extends DataNode {

    public static readonly K_TYPE_KIND = "TypeKind";

    constructor(nodeData: INodeData, parent: DataNode, protected _rootNode?: DataNode) {
        super(nodeData, parent)
    }

    public getPackageRootPath(): string {
        if (this._rootNode?.uri) {
            return Uri.parse(this._rootNode.uri).fsPath
        }

        const unmanagedFolder = this.getUnmanagedFolderAncestor()
        if (unmanagedFolder?.uri) {
            return Uri.parse(unmanagedFolder.uri).fsPath
        }

        return ""
    }

    protected async loadData(): Promise<SymbolInformation[] | DocumentSymbol[] | undefined> {
        if (!this.hasChildren() || !this.nodeData.uri) {
            return undefined
        }

        return workspace.openTextDocument(Uri.parse(this.nodeData.uri)).then((doc) => {
            return this.getSymbols(doc.textDocument)
        })
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result: ExplorerNode[] = []
        if (this.nodeData.children?.length) {
            for (const child of this.nodeData.children) {
                const documentSymbol: DocumentSymbol = child as DocumentSymbol
                if (documentSymbol.kind === SymbolKind.Package) {
                    continue
                }
                if (documentSymbol.name === this.nodeData.name) {
                    for (const childSymbol of documentSymbol?.children ?? []) {
                        result.push(new DocumentSymbolNode(childSymbol, this))
                    }
                }
            }
        }
        return result
    }

    protected hasChildren(): boolean {
        return Settings.showMembers()
    }

    private async getSymbols(document: TextDocument): Promise<SymbolInformation[] | DocumentSymbol[] | undefined> {
        const extensionApi = await getJavaExtensionApi()
        if (extensionApi) {
            const params: DocumentSymbolParams = { textDocument: { uri: document.uri } }
            return await extensionApi.getDocumentSymbols(params)
        }
        return []
    }

    protected get command(): Command {
        return {
            title: "Open source file contents",
            command: Commands.JAVA_PROJECT_EXPLORER_RESOURCE_OPEN,
            arguments: [Uri.parse(this.uri ?? "") ],
        }
    }

    protected get contextValue(): string {
        let contextValue: string = Explorer.ContextValueType.Type
        const type = this.nodeData.metaData?.[PrimaryTypeNode.K_TYPE_KIND]

        if (type === TypeKind.Enum) {
            contextValue += "+enum"
        } else if (type === TypeKind.Interface) {
            contextValue += "+interface"
        } else {
            contextValue += "+class"
        }

        if (isTest(this._rootNode?.nodeData)) {
            contextValue += "+test"
        }

        if (this._rootNode?.getParent() instanceof ProjectNode
            && (this._rootNode.getParent() as ProjectNode).nodeData?.metaData?.MaxSourceVersion >= 16) {
            contextValue += "+allowRecord"
        }

        return contextValue
    }

    private getUnmanagedFolderAncestor(): ProjectNode | undefined {
        let ancestor = this.getParent()
        while (ancestor && !(ancestor instanceof ProjectNode)) {
            ancestor = ancestor.getParent()
        }
        if (ancestor?.isUnmanagedFolder()) {
            return ancestor
        }

        return undefined
    }


}
