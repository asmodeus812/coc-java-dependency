import { Extension, extensions } from 'coc.nvim'

let extensionApi: any = undefined

export function getJavaExtension(): Extension<any> | undefined {
    const java = extensions.getExtensionById("coc-java")
    if (!java || java == null || java === undefined) {
        return extensions.getExtensionById("coc-java-dev")
    }
    return java
}

export async function getJavaExtensionApi(): Promise<any> {
    if (extensionApi) {
        return extensionApi
    }
    extensionApi = await getJavaExtension()?.activate()
    return extensionApi
}
