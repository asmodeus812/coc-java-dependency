// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import {SymbolInformation} from "coc.nvim";
import {INodeData} from "./nodeData";

export interface ITypeRootNodeData extends INodeData {
    symbolTree?: Map<string, SymbolInformation[]>;
}
